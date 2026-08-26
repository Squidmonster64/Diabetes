import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  generateClarifications,
  intentCopy,
  parseTimeExpression,
  type ClarificationQuestion,
  type ProvisionalEvent,
} from "@diabetes-companion/natural-language";
import { ClarificationPrompt, ExtractedRow, SpanHighlighter } from "../components/ReviewPrimitives.js";
import { ResultLayout } from "../components/ResultLayout.js";
import { Screen } from "../components/Screen.js";
import { resolveFoodComponent, type FoodMatchCandidate, type ResolvedFoodComponent } from "../lib/foodMatch.js";
import { api } from "../lib/apiClient.js";
import { brandedFoodOptionsForPhrase, subwayAustraliaOptions, type BrandedFoodOption } from "../lib/brandedFoods.js";
import { useNaturalLanguageDraft } from "../state/NaturalLanguageContext.js";
import { useWorkflow } from "../state/WorkflowContext.js";
import type { OnlineFoodLookupCandidate } from "@diabetes-companion/food-contracts";

function describeTimestamp(iso: string | null, referenceNowMs: number): string {
  if (!iso) return "not stated";
  const minutes = Math.round((referenceNowMs - Date.parse(iso)) / 60_000);
  if (Math.abs(minutes) < 2) return "just now";
  if (minutes > 0 && minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (minutes > 0 && hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleString();
}

function describeFoodInterpretation(component: ResolvedFoodComponent): string {
  const { quantity, unit, qualifier, phrase } = component.component;
  if (quantity.value !== null) return `${quantity.value}${unit.value ? ` ${unit.value}` : ""} ${phrase}`;
  if (qualifier) return `${qualifier} ${phrase}`;
  return phrase;
}

function spansForText(text: string, fragments: readonly string[]): Array<{ start: number; end: number }> {
  let cursor = 0;
  return fragments.flatMap((fragment) => {
    if (!fragment) return [];
    const start = text.toLowerCase().indexOf(fragment.toLowerCase(), cursor);
    if (start < 0) return [];
    cursor = start + fragment.length;
    return [{ start, end: cursor }];
  });
}

/** A food can be offered an online lookup only when the local resolver found
 * no candidate at all and no carbohydrate amount is available. This avoids
 * mistaking parser-side quantity statuses for resolver-side match outcomes. */
export function requiresOnlineFoodLookup(component: ResolvedFoodComponent): boolean {
  return component.component.quantityNeededForCalculation && component.bestMatch === null && component.carbohydrateGrams === null;
}

const ONLINE_LOOKUP_REVIEW_TIMEOUT_MS = 7_000;

/** Every parsed value stays editable and remains a reviewable draft until the
 * explicit hand-off to glucose entry. This component never calculates a dose. */
export function NaturalLanguageReviewScreen() {
  const { captureId, captureCode, provisionalEvent, resolvedComponents, intent, proposedNextStep, setDraft } = useNaturalLanguageDraft();
  const { setCarbResult, setGlucoseEntry } = useWorkflow();
  const navigate = useNavigate();
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [manualGrams, setManualGrams] = useState<Record<number, string>>({});
  const [manualGlucose, setManualGlucose] = useState("");
  const [detailsOpenIndex, setDetailsOpenIndex] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [savedGlucoseUnit, setSavedGlucoseUnit] = useState<"MMOL_L" | "MG_DL" | null>(null);
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [subwaySizeByIndex, setSubwaySizeByIndex] = useState<Record<number, "SIX_INCH" | "FOOTLONG">>({});
  const [subwaySelectionByIndex, setSubwaySelectionByIndex] = useState<Record<number, string>>({});
  const [onlineLookupByIndex, setOnlineLookupByIndex] = useState<Record<number, { status: "loading" | "ready" | "unavailable"; candidates: readonly OnlineFoodLookupCandidate[] }>>({});
  const onlineLookupByIndexRef = useRef(onlineLookupByIndex);
  const [onlineSaveErrorByIndex, setOnlineSaveErrorByIndex] = useState<Record<number, string | null>>({});
  const [onlineCustomFoodIdByIndex, setOnlineCustomFoodIdByIndex] = useState<Record<number, string>>({});
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const referenceNowMs = provisionalEvent ? Date.parse(provisionalEvent.referenceNow) : Date.now();

  const applyEventChange = (updated: Partial<Pick<ProvisionalEvent, "glucose" | "recentInsulin" | "meal">>) => {
    if (!provisionalEvent) return;
    const next: ProvisionalEvent = { ...provisionalEvent, ...updated };
    const clarifications = generateClarifications({ glucose: next.glucose, recentInsulin: next.recentInsulin, meal: next.meal });
    setDraft({ ...next, clarifications }, resolvedComponents);
  };

  useEffect(() => {
    let active = true;
    api
      .getCurrentSettings()
      .then((settings) => {
        const unit = (settings as { glucoseUnit?: unknown }).glucoseUnit;
        if (active) setSavedGlucoseUnit(unit === "MG_DL" ? "MG_DL" : "MMOL_L");
      })
      // A returning user without an active clinician settings version keeps the
      // documented app default of mmol/L; they can still change it on demand.
      .catch(() => {
        if (active) setSavedGlucoseUnit("MMOL_L");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!provisionalEvent?.glucose || provisionalEvent.glucose.unit.status !== "missing" || !savedGlucoseUnit) return;
    const glucose = provisionalEvent.glucose;
    const nextGlucose = {
      ...glucose,
      unit: {
        ...glucose.unit,
        rawSpan: "saved glucose-unit preference",
        value: savedGlucoseUnit,
        confidence: 1,
        status: "provisional" as const,
      },
    };
    const next = { ...provisionalEvent, glucose: nextGlucose };
    setDraft({ ...next, clarifications: generateClarifications(next) }, resolvedComponents);
  }, [provisionalEvent, resolvedComponents, savedGlucoseUnit, setDraft]);

  useEffect(() => {
    onlineLookupByIndexRef.current = onlineLookupByIndex;
  }, [onlineLookupByIndex]);

  useEffect(() => {
    if (!provisionalEvent) return;
    // Lookup state is keyed by review-row index. The explicit loop avoids
    // search-as-you-type behavior and only runs once for each unresolved draft.
    const requests = resolvedComponents
      .map((component, index) => ({ component, index }))
      .filter(({ component, index }) =>
        requiresOnlineFoodLookup(component) &&
        !/\bsubway\b/i.test(component.component.phrase) &&
        !onlineLookupByIndexRef.current[index],
      );
    if (requests.length === 0) return;

    let active = true;
    const reviewTimeouts: ReturnType<typeof setTimeout>[] = [];
    for (const { component, index } of requests) {
      setOnlineLookupByIndex((current) => ({ ...current, [index]: { status: "loading", candidates: [] } }));
      const reviewTimeout = setTimeout(() => {
        if (active) setOnlineLookupByIndex((current) => ({ ...current, [index]: { status: "unavailable", candidates: [] } }));
      }, ONLINE_LOOKUP_REVIEW_TIMEOUT_MS);
      reviewTimeouts.push(reviewTimeout);

      void api.lookupFoodOnline(component.component.phrase)
        .then((result) => {
          if (!active) return;
          setOnlineLookupByIndex((current) => ({
            ...current,
            [index]: { status: result.unavailable ? "unavailable" : "ready", candidates: result.candidates },
          }));
        })
        .catch(() => {
          if (active) setOnlineLookupByIndex((current) => ({ ...current, [index]: { status: "unavailable", candidates: [] } }));
        })
        .finally(() => clearTimeout(reviewTimeout));
    }
    return () => {
      active = false;
      reviewTimeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, [provisionalEvent, resolvedComponents]);

  const updateGlucoseValue = (value: number) => {
    const timestamp = new Date(referenceNowMs).toISOString();
    const nextGlucose = glucose
      ? { ...glucose, value: { ...glucose.value, rawSpan: String(value), value, confidence: 1, status: "provisional" as const } }
      : {
          value: { rawSpan: String(value), value, confidence: 1, status: "provisional" as const, requiresConfirmation: true },
          unit: { rawSpan: "", value: null, confidence: 0, status: "missing" as const, requiresConfirmation: true },
          timestamp: { rawSpan: "manual entry", value: timestamp, confidence: 1, status: "provisional" as const, requiresConfirmation: true },
        };
    applyEventChange({ glucose: nextGlucose });
  };

  const updateComponentAt = async (index: number, patch: { value?: number; unit?: string | null; phrase?: string }) => {
    if (!provisionalEvent?.meal) return;
    const components = provisionalEvent.meal.components.map((component, i) => {
      if (i !== index) return component;
      const nextUnit = patch.unit ?? component.unit.value;
      const quantityKind =
        nextUnit === "grams" || nextUnit === "g"
          ? "GRAMS" as const
          : nextUnit === "ml"
            ? "MILLILITRES" as const
            : nextUnit === "serving"
              ? "SERVING" as const
              : component.quantityKind;
      return {
        ...component,
        phrase: patch.phrase?.trim() || component.phrase,
        quantity: patch.value !== undefined
          ? { ...component.quantity, value: patch.value, status: "provisional" as const }
          : component.quantity,
        unit: patch.unit
          ? { ...component.unit, value: patch.unit, status: "provisional" as const }
          : component.unit,
        quantityKind,
        selectedServingMeasureId: patch.unit ? null : component.selectedServingMeasureId,
        matchStatus: "provisional" as const,
        quantityNeededForCalculation: true,
      };
    });

    setBusyIndex(index);
    try {
      const confirmedOnlineFoodId = onlineCustomFoodIdByIndex[index];
      const updated: ResolvedFoodComponent = confirmedOnlineFoodId
        ? {
            component: components[index]!,
            matchStatus: "resolved",
            bestMatch: resolvedComponents[index]?.bestMatch ?? null,
            alternates: [],
            carbohydrateGrams: (await api.calculateCustomFoodCarbohydrate(confirmedOnlineFoodId, patch.value ?? components[index]!.quantity.value ?? 0)).carbohydrateGrams,
            servingMeasures: [],
            requiresManualPortion: false,
            assumedPortion: null,
          }
        : await resolveFoodComponent(components[index]!);
      const nextResolved = resolvedComponents.map((component, i) => (i === index ? updated : component));
      const meal = { ...provisionalEvent.meal, components };
      const clarifications = generateClarifications({ glucose: provisionalEvent.glucose, recentInsulin: provisionalEvent.recentInsulin, meal });
      setDraft({ ...provisionalEvent, meal, clarifications }, nextResolved);
    } finally {
      setBusyIndex(null);
    }
  };

  const chooseOfficialBrandedFoodAt = (index: number, option: BrandedFoodOption) => {
    if (!provisionalEvent?.meal) return;
    const components = provisionalEvent.meal.components.map((component, componentIndex) =>
      componentIndex === index
        ? {
            ...component,
            quantity: { ...component.quantity, rawSpan: option.servingLabel, value: 1, confidence: 1, status: "provisional" as const },
            unit: { ...component.unit, rawSpan: option.servingLabel, value: option.servingLabel, confidence: 1, status: "provisional" as const },
            quantityKind: "COUNT" as const,
            matchStatus: "provisional" as const,
            quantityNeededForCalculation: true,
          }
        : component,
    );
    const selectedMatch: FoodMatchCandidate = {
      source: "BRANDED_OFFICIAL",
      label: option.label,
      description: option.servingLabel,
      brand: option.brand,
      confidence: 1,
      matchReason: `Explicitly selected from ${option.sourceLabel}, ${option.sourceVersion}.`,
      sourceDataset: null,
      sourceFoodId: null,
      customFoodId: null,
      sourceUrl: option.sourceUrl,
      sourceVersion: option.sourceVersion,
    };
    const selectedComponent: ResolvedFoodComponent = {
      component: components[index]!,
      matchStatus: "resolved",
      bestMatch: selectedMatch,
      alternates: [],
      carbohydrateGrams: option.carbohydrateGrams,
      servingMeasures: [],
      requiresManualPortion: false,
      assumedPortion: null,
    };
    const nextResolved = resolvedComponents.map((component, componentIndex) => (componentIndex === index ? selectedComponent : component));
    const meal = { ...provisionalEvent.meal, components };
    const next = { ...provisionalEvent, meal };
    setDraft({ ...next, clarifications: generateClarifications(next) }, nextResolved);
    setQuestionsOpen(false);
  };

  const chooseOnlineFoodAt = async (index: number, candidate: OnlineFoodLookupCandidate) => {
    if (!provisionalEvent?.meal) return;
    setBusyIndex(index);
    setOnlineSaveErrorByIndex((current) => ({ ...current, [index]: null }));
    try {
      const saved = await api.createCustomFood({
        foodType: "ONLINE_CONFIRMED",
        name: candidate.name,
        brand: candidate.brand,
        servingDescription: candidate.servingDescription,
        servingGrams: candidate.servingGrams,
        carbohydratePerServingGrams: candidate.carbohydratePerServingGrams,
        carbohydratePer100gGrams: candidate.carbohydratePer100gGrams,
        sourceName: "Open Food Facts (community-contributed)",
        sourceReference: candidate.sourceUrl,
        sourceRetrievedAt: candidate.sourceRetrievedAt,
      });
      const components = provisionalEvent.meal.components.map((component, componentIndex) =>
        componentIndex === index
          ? {
              ...component,
              quantity: candidate.servingGrams !== null && candidate.carbohydratePerServingGrams !== null
                ? { ...component.quantity, rawSpan: candidate.servingDescription ?? "standard serving", value: candidate.servingGrams, confidence: 1, status: "provisional" as const }
                : component.quantity,
              unit: candidate.servingGrams !== null && candidate.carbohydratePerServingGrams !== null
                ? { ...component.unit, rawSpan: candidate.servingDescription ?? "standard serving", value: "grams", confidence: 1, status: "provisional" as const }
                : component.unit,
              quantityKind: candidate.servingGrams !== null && candidate.carbohydratePerServingGrams !== null ? "GRAMS" as const : component.quantityKind,
              matchStatus: "provisional" as const,
              quantityNeededForCalculation: candidate.servingGrams === null || candidate.carbohydratePerServingGrams === null,
            }
          : component,
      );
      const match: FoodMatchCandidate = {
        source: "ONLINE_CONFIRMED",
        label: candidate.name,
        description: candidate.servingDescription,
        brand: candidate.brand,
        confidence: 1,
        matchReason: "You explicitly confirmed this online community-database result and saved it to your food list.",
        sourceDataset: null,
        sourceFoodId: candidate.productCode,
        customFoodId: saved.id,
        sourceUrl: candidate.sourceUrl,
        sourceVersion: candidate.sourceRetrievedAt,
      };
      const carbohydrateGrams = candidate.servingGrams !== null && candidate.carbohydratePerServingGrams !== null
        ? candidate.carbohydratePerServingGrams
        : null;
      const selected: ResolvedFoodComponent = {
        component: components[index]!,
        matchStatus: "resolved",
        bestMatch: match,
        alternates: [],
        carbohydrateGrams,
        servingMeasures: [],
        requiresManualPortion: carbohydrateGrams === null,
        assumedPortion: null,
      };
      const nextResolved = resolvedComponents.map((component, componentIndex) => (componentIndex === index ? selected : component));
      const meal = { ...provisionalEvent.meal, components };
      const next = { ...provisionalEvent, meal };
      setDraft({ ...next, clarifications: generateClarifications(next) }, nextResolved);
      setOnlineCustomFoodIdByIndex((current) => ({ ...current, [index]: saved.id }));
      setQuestionsOpen(false);
    } catch {
      setOnlineSaveErrorByIndex((current) => ({ ...current, [index]: "I found a possible result, but could not save it. Please try again or enter the label carbohydrate value." }));
    } finally {
      setBusyIndex(null);
    }
  };

  const selectServingMeasureAt = async (index: number, measureId: string) => {
    if (!provisionalEvent?.meal) return;
    const components = provisionalEvent.meal.components.map((component, i) =>
      i === index ? { ...component, selectedServingMeasureId: measureId, matchStatus: "provisional" as const } : component,
    );
    setBusyIndex(index);
    try {
      const updated = await resolveFoodComponent(components[index]!, undefined, measureId);
      const nextResolved = resolvedComponents.map((component, i) => (i === index ? updated : component));
      const meal = { ...provisionalEvent.meal, components };
      const clarifications = generateClarifications({ glucose: provisionalEvent.glucose, recentInsulin: provisionalEvent.recentInsulin, meal });
      setDraft({ ...provisionalEvent, meal, clarifications }, nextResolved);
    } finally {
      setBusyIndex(null);
    }
  };

  if (!provisionalEvent) {
    return (
      <Screen title="Review details">
        <p className="muted">Nothing to review yet.</p>
        <button className="btn-primary" type="button" onClick={() => navigate("/describe")}>Describe an event</button>
      </Screen>
    );
  }

  const { glucose, recentInsulin, symptoms, clarifications } = provisionalEvent;
  const totalCarbohydrateGrams = resolvedComponents.reduce((sum, component) => sum + (component.carbohydrateGrams ?? 0), 0);
  const allComponentsResolved = resolvedComponents.every((component) => component.carbohydrateGrams !== null);
  const brandedQuestionIndexes = new Set(
    resolvedComponents.flatMap((component, index) =>
      component.carbohydrateGrams === null && brandedFoodOptionsForPhrase(component.component.phrase).length > 0 ? [index] : [],
    ),
  );
  const onlineQuestionIndexes = new Set(
    resolvedComponents.flatMap((component, index) =>
      requiresOnlineFoodLookup(component) && !brandedQuestionIndexes.has(index) ? [index] : [],
    ),
  );
  const blockingClarifications = clarifications.filter(
    (clarification) =>
      clarification.blocking &&
      ![...brandedQuestionIndexes, ...onlineQuestionIndexes].some((index) => clarification.field.startsWith(`meal.components[${index}]`)),
  );
  const nonBlockingClarifications = clarifications.filter((clarification) => !clarification.blocking);
  const questionCount = blockingClarifications.length + brandedQuestionIndexes.size + onlineQuestionIndexes.size;
  const unresolvedPortionIndexes = resolvedComponents.flatMap((component, index) =>
    component.carbohydrateGrams === null &&
    component.requiresManualPortion &&
    !brandedQuestionIndexes.has(index) &&
    !onlineQuestionIndexes.has(index)
      ? [index]
      : [],
  );
  const blocked = blockingClarifications.length > 0 || !allComponentsResolved;
  const actionableQuestionCount = questionCount + unresolvedPortionIndexes.length;
  const rawSpans = useMemo(
    () =>
      spansForText(provisionalEvent.originalText, [
        glucose?.value.rawSpan ?? "",
        glucose?.unit.rawSpan ?? "",
        recentInsulin?.amountUnits.rawSpan ?? "",
        recentInsulin?.takenAt.rawSpan ?? "",
        ...resolvedComponents.map((component) => component.component.rawSpan),
      ]),
    [glucose, provisionalEvent.originalText, recentInsulin, resolvedComponents],
  );

  const renderClarification = (clarification: ClarificationQuestion) => {
    if (clarification.field === "glucose.value") {
      return (
        <ClarificationPrompt key={clarification.field} question={clarification.question}>
          <input
            aria-label="Glucose value"
            type="number"
            inputMode="decimal"
            min="0"
            defaultValue={glucose?.value.value ?? ""}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) updateGlucoseValue(value);
            }}
          />
        </ClarificationPrompt>
      );
    }

    if (clarification.field === "glucose.unit") {
      return (
        <ClarificationPrompt key={clarification.field} question={clarification.question}>
          <button className="btn-secondary" type="button" onClick={() => glucose && applyEventChange({ glucose: { ...glucose, unit: { ...glucose.unit, value: "MMOL_L", status: "provisional" } } })}>mmol/L</button>
          <button className="btn-secondary" type="button" onClick={() => glucose && applyEventChange({ glucose: { ...glucose, unit: { ...glucose.unit, value: "MG_DL", status: "provisional" } } })}>mg/dL</button>
        </ClarificationPrompt>
      );
    }

    if (clarification.field === "recentInsulin.takenAt") {
      const chooseTime = (text: string) => {
        if (!recentInsulin) return;
        const parsed = parseTimeExpression(text, referenceNowMs);
        if (parsed.value) applyEventChange({ recentInsulin: { ...recentInsulin, takenAt: parsed } });
      };
      return (
        <ClarificationPrompt key={clarification.field} question={clarification.question}>
          <button className="btn-secondary" type="button" onClick={() => chooseTime("30 min ago")}>30 min</button>
          <button className="btn-secondary" type="button" onClick={() => chooseTime("1 hour ago")}>1 hr</button>
          <button className="btn-secondary" type="button" onClick={() => chooseTime("2 hours ago")}>2 hr</button>
          <input
            aria-label={`${clarification.question} exact time`}
            placeholder="Set exact time"
            onBlur={(event) => {
              if (!event.target.value.trim()) return;
              chooseTime(event.target.value);
            }}
          />
        </ClarificationPrompt>
      );
    }

    if (clarification.field === "recentInsulin.insulinType") {
      return (
        <ClarificationPrompt key={clarification.field} question={clarification.question}>
          <button className="btn-secondary" type="button" onClick={() => recentInsulin && applyEventChange({ recentInsulin: { ...recentInsulin, concentratedInsulinAmbiguity: false } })}>Standard concentration</button>
        </ClarificationPrompt>
      );
    }

    const mealMatch = clarification.field.match(/^meal\.components\[(\d+)\]/);
    if (mealMatch) {
      const index = Number(mealMatch[1]);
      const resolved = resolvedComponents[index];
      if (clarification.field.endsWith(".serving")) {
        return (
          <ClarificationPrompt key={clarification.field} question={clarification.question}>
            {resolved?.servingMeasures.length ? resolved.servingMeasures.map((measure) => (
              <button key={measure.measureId} className="btn-secondary" type="button" disabled={busyIndex === index} onClick={() => void selectServingMeasureAt(index, measure.measureId)}>
                {measure.label}{measure.gramAmount !== null ? ` (${measure.gramAmount} g)` : measure.volumeMillilitres !== null ? ` (${measure.volumeMillilitres} ml)` : ""}
              </button>
            )) : <span className="muted">No usable database serving measure was found. Enter grams below instead.</span>}
          </ClarificationPrompt>
        );
      }
      return (
        <ClarificationPrompt key={clarification.field} question={clarification.question}>
          <input
            aria-label={clarification.question}
            type="number"
            inputMode="decimal"
            min="0"
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) void updateComponentAt(index, { value });
            }}
          />
        </ClarificationPrompt>
      );
    }

    return <ClarificationPrompt key={clarification.field} question={clarification.question}><span className="muted">Update this value before continuing.</span></ClarificationPrompt>;
  };

  const renderSubwayQuestion = (index: number) => {
    const size = subwaySizeByIndex[index] ?? "SIX_INCH";
    const options = subwayAustraliaOptions(size);
    const selectedId = subwaySelectionByIndex[index] ?? "";
    const selectedOption = options.find((option) => option.id === selectedId) ?? null;

    return (
      <ClarificationPrompt key={`subway-${index}`} question="Which Subway sandwich and size did you have?">
        <select
          aria-label="Subway sandwich size"
          value={size}
          onChange={(event) => {
            setSubwaySizeByIndex((current) => ({ ...current, [index]: event.target.value as "SIX_INCH" | "FOOTLONG" }));
            setSubwaySelectionByIndex((current) => ({ ...current, [index]: "" }));
          }}
        >
          <option value="SIX_INCH">6-inch</option>
          <option value="FOOTLONG">Footlong</option>
        </select>
        <select
          aria-label="Subway sandwich product"
          value={selectedId}
          onChange={(event) => setSubwaySelectionByIndex((current) => ({ ...current, [index]: event.target.value }))}
        >
          <option value="">Choose the standard menu sandwich</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label} — {option.carbohydrateGrams} g carbohydrate</option>
          ))}
        </select>
        <button className="btn-primary" type="button" disabled={!selectedOption} onClick={() => selectedOption && chooseOfficialBrandedFoodAt(index, selectedOption)}>
          Use this official menu value
        </button>
        <span className="muted">
          Source: Subway Australia Nutritional Web Guide, May 2026. Confirm any bread, sauce, or ingredient customisation that differs from the standard menu item.
        </span>
      </ClarificationPrompt>
    );
  };

  const renderOnlineQuestion = (index: number) => {
    const lookup = onlineLookupByIndex[index];
    const phrase = resolvedComponents[index]?.component.phrase ?? "that food";
    const saveError = onlineSaveErrorByIndex[index];

    if (!lookup || lookup.status === "loading") {
      return <ClarificationPrompt key={`online-${index}`} question={`Looking online for “${phrase}”…`}><span className="muted">This will only suggest a result for you to confirm.</span></ClarificationPrompt>;
    }
    if (lookup.status === "unavailable") {
      return (
        <ClarificationPrompt key={`online-${index}`} question={`I can’t find “${phrase}” online right now. Could you describe it differently?`}>
          <span className="muted">Try the brand, product name, size, or the carbohydrate value from its label.</span>
          <button className="btn-secondary" type="button" onClick={() => navigate("/describe")}>Go back and describe it differently</button>
        </ClarificationPrompt>
      );
    }
    if (lookup.candidates.length === 0) {
      return (
        <ClarificationPrompt key={`online-${index}`} question={`I can’t find “${phrase}” online right now. Could you describe it differently?`}>
          <span className="muted">Try the brand, product name, size, or the carbohydrate value from its label.</span>
          <button className="btn-secondary" type="button" onClick={() => navigate("/describe")}>Go back and describe it differently</button>
        </ClarificationPrompt>
      );
    }

    return (
      <ClarificationPrompt key={`online-${index}`} question={`I found these possible matches for “${phrase}”. Which one is correct?`}>
        <span className="muted">Open Food Facts is community-contributed. Please check the product and carbohydrate basis before saving or using it.</span>
        {lookup.candidates.map((candidate) => {
          const carbohydrateBasis = candidate.carbohydratePerServingGrams !== null && candidate.servingDescription
            ? `${candidate.carbohydratePerServingGrams} g carbohydrate per ${candidate.servingDescription}`
            : `${candidate.carbohydratePer100gGrams} g carbohydrate per 100 g`;
          return (
            <button key={candidate.productCode} className="btn-secondary" type="button" disabled={busyIndex === index} onClick={() => void chooseOnlineFoodAt(index, candidate)}>
              Use {candidate.name}{candidate.brand ? ` — ${candidate.brand}` : ""} ({carbohydrateBasis})
            </button>
          );
        })}
        {saveError ? <span className="muted">{saveError}</span> : null}
      </ClarificationPrompt>
    );
  };

  const handOffConfirmedDraft = async () => {
    if (blocked || !provisionalEvent) return;
    setAcceptError(null);
    setAccepting(true);
    try {
      if (captureId) {
        await api.acceptCapture(captureId, provisionalEvent);
      }
      const officialSelection = resolvedComponents.find((component) => component.bestMatch?.source === "BRANDED_OFFICIAL")?.bestMatch ?? null;
    setCarbResult({
      sourceDataset: officialSelection ? "BRANDED_OFFICIAL" : "AUSNUT_2023",
      sourceFoodId: officialSelection ? `official-menu:${officialSelection.label}` : "natural-language-entry",
      foodName: officialSelection?.label ?? "Described meal",
      brand: officialSelection?.brand ?? null,
      portionDescription: resolvedComponents.map((component) => `${component.component.phrase}${component.bestMatch ? ` (${component.bestMatch.label})` : ""}`).join(", "),
      portionQuantity: 1,
      portionGrams: null,
      portionMillilitres: null,
      carbohydrateGrams: Math.round(totalCarbohydrateGrams * 10) / 10,
      carbohydrateDefinition: "available_carbohydrate_without_sugar_alcohols",
      provenance: officialSelection
        ? { database: "official_menu", sourceObject: `${officialSelection.sourceUrl ?? "official-menu"}#${officialSelection.sourceVersion ?? "current"}`, databaseSha256: "" }
        : { database: "australian_foods.sqlite", sourceObject: "natural_language_review", databaseSha256: "" },
    });
    setGlucoseEntry({
      currentGlucose: glucose?.value.value !== null && glucose?.value.value !== undefined ? String(glucose.value.value) : "",
      glucoseUnit: glucose?.unit.value ?? "MMOL_L",
      glucoseTimestamp: glucose?.timestamp.value ?? new Date(referenceNowMs).toISOString(),
      glucoseSource: "MANUAL_TRANSCRIPTION",
      activeInsulinUnits: null,
      recentHistoryComplete: false,
      hypoSymptoms: symptoms.hypoSymptoms,
      duplicateDose: false,
      concentratedInsulinConfirmed: false,
      priorRapidActingDoses: recentInsulin && recentInsulin.amountUnits.value !== null && recentInsulin.takenAt.value !== null ? [{ units: String(recentInsulin.amountUnits.value), administeredAt: recentInsulin.takenAt.value }] : [],
      specialSituations: symptoms.specialSituations,
      captureId,
    });
      navigate("/glucose-entry");
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "This capture could not be accepted.");
    } finally {
      setAccepting(false);
    }
  };

  const handleSettingsRedirect = async () => {
    if (!captureId || !provisionalEvent) {
      navigate("/settings");
      return;
    }
    setAcceptError(null);
    setAccepting(true);
    try {
      await api.acceptCapture(captureId, provisionalEvent);
      navigate("/settings");
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "Could not save this capture before opening settings.");
    } finally {
      setAccepting(false);
    }
  };

  const handleKeepLog = async () => {
    if (blocked || !provisionalEvent) return;
    if (!captureId) {
      navigate("/captures");
      return;
    }
    setAcceptError(null);
    setAccepting(true);
    try {
      await api.acceptCapture(captureId, provisionalEvent);
      navigate("/captures");
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "This capture could not be saved.");
    } finally {
      setAccepting(false);
    }
  };

  const handleRejectCapture = async () => {
    if (captureId) {
      try {
        await api.rejectCapture(captureId);
      } catch {
        // The original words remain stored even if the reject action fails.
      }
    }
    navigate("/");
  };

  const intentInfo = intent ? intentCopy(intent.intent) : null;
  const excluded = intent?.intent === "EMERGENCY_OR_EXCLUDED";
  const settingsOnly = intent?.intent === "SETTINGS_CHANGE_ATTEMPT" || proposedNextStep?.kind === "SETTINGS_SCREEN_ONLY";
  const logOnly = proposedNextStep?.kind === "LOG_ONLY";

  return (
    <Screen title="Review details" className="screen--result">
      <ResultLayout
        title="Review extracted details"
        head={
          <>
            <p className="aperture__eyebrow">Your words, retained</p>
            <SpanHighlighter text={provisionalEvent.originalText} spans={rawSpans} selectedIndex={selectedRow} />
          </>
        }
        footer={
          <>
            {questionsOpen && blocked ? (
              <section className="question-panel" aria-label="Questions needing your answer">
                <h2>One quick question at a time</h2>
                {[...brandedQuestionIndexes].map(renderSubwayQuestion)}
                {[...onlineQuestionIndexes].map(renderOnlineQuestion)}
                {blockingClarifications.map(renderClarification)}
                {unresolvedPortionIndexes.map((index) => {
                  const component = resolvedComponents[index];
                  if (!component) return null;
                  return (
                    <ClarificationPrompt key={`portion-${index}`} question={`How much ${component.component.phrase} did you have? Choose the food match if needed, then enter grams.`}>
                      <span className="muted">
                        {component.bestMatch
                          ? `Best database candidate: ${component.bestMatch.label}. Confirm or change it before a carbohydrate figure is calculated.`
                          : "No confident database match yet. Enter grams from the packet or a measured portion."}
                      </span>
                      <label htmlFor={`question-grams-${index}`}>Portion grams</label>
                      <input
                        id={`question-grams-${index}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={manualGrams[index] ?? ""}
                        onChange={(event) => setManualGrams((current) => ({ ...current, [index]: event.target.value }))}
                      />
                      <button
                        className="btn-primary"
                        type="button"
                        disabled={busyIndex === index}
                        onClick={() => {
                          const grams = Number(manualGrams[index]);
                          if (Number.isFinite(grams) && grams > 0) void updateComponentAt(index, { value: grams, unit: "grams" });
                        }}
                      >
                        Use this amount
                      </button>
                    </ClarificationPrompt>
                  );
                })}
              </section>
            ) : null}
            {acceptError ? <div className="banner banner-danger">{acceptError}</div> : null}
            {blocked && !questionsOpen ? (
              <p className="muted">
                {actionableQuestionCount === 0
                  ? "A food match still needs a confirmed portion before anything can be calculated."
                  : `${actionableQuestionCount} specific question${actionableQuestionCount === 1 ? " needs" : "s need"} your answer before you continue.`}
              </p>
            ) : null}
            {blocked ? (
              <button className="btn-secondary" type="button" onClick={() => setQuestionsOpen((current) => !current)}>
                {questionsOpen ? "Hide questions" : actionableQuestionCount === 0 ? "Confirm the food portion" : `Answer ${actionableQuestionCount} question${actionableQuestionCount === 1 ? "" : "s"}`}
              </button>
            ) : null}
            {excluded ? (
              <button className="btn-primary" type="button" onClick={() => void handleRejectCapture()}>Keep these words and return home</button>
            ) : settingsOnly ? (
              <button className="btn-primary" type="button" disabled={accepting} onClick={() => void handleSettingsRedirect()}>
                {accepting ? "Saving…" : "Open clinician-report settings"}
              </button>
            ) : logOnly ? (
              <button className="btn-primary" type="button" disabled={blocked || accepting} onClick={() => void handleKeepLog()}>
                {accepting ? "Saving…" : "Keep this record"}
              </button>
            ) : (
              <button className="btn-primary" type="button" disabled={blocked || accepting} onClick={() => void handOffConfirmedDraft()}>
                {accepting ? "Saving confirmed values…" : "Confirm these values"}
              </button>
            )}
            <button className="btn-secondary" type="button" disabled={accepting} onClick={() => void handleRejectCapture()}>
              Discard this interpretation
            </button>
          </>
        }
      >
        <div className="lifecycle-banner">Nothing has been calculated yet. No insulin dose is suggested on this screen.</div>
        {captureCode ? <p className="muted">Saved as {captureCode}. Original words are kept even if you change the draft below.</p> : null}
        {intentInfo ? (
          <section className="card">
            <p className="field-label">{intentInfo.title}</p>
            <p>{intentInfo.body}</p>
            {intent?.settingsLanguageDetected ? (
              <p className="muted">Settings language was noticed and will not be applied from this capture.</p>
            ) : null}
            {intent?.doseRequestLanguageDetected ? (
              <p className="muted">A dose was asked for. This screen still does not calculate one.</p>
            ) : null}
          </section>
        ) : null}
        <section className="card">
          <ExtractedRow
            label="Glucose"
            value={glucose ? `${glucose.value.value ?? "?"} ${glucose.unit.value === "MG_DL" ? "mg/dL" : glucose.unit.value === "MMOL_L" ? "mmol/L" : "unit needed"}` : "Not stated"}
            detail={glucose ? describeTimestamp(glucose.timestamp.value, referenceNowMs) : "Enter before preview"}
            selected={selectedRow === 0}
            onSelect={() => setSelectedRow(0)}
          />
          {glucose ? (
            <div className="field">
              <button className="btn-secondary" type="button" onClick={() => setUnitPickerOpen((current) => !current)}>
                {unitPickerOpen ? "Hide glucose unit" : `Change glucose unit (${glucose.unit.value === "MG_DL" ? "mg/dL" : "mmol/L"})`}
              </button>
              {unitPickerOpen ? (
                <div className="clarification-prompt__choices">
                  <button className="btn-secondary" type="button" onClick={() => {
                    applyEventChange({ glucose: { ...glucose, unit: { ...glucose.unit, rawSpan: "manual mmol/L selection", value: "MMOL_L", confidence: 1, status: "provisional" } } });
                    setUnitPickerOpen(false);
                  }}>mmol/L</button>
                  <button className="btn-secondary" type="button" onClick={() => {
                    applyEventChange({ glucose: { ...glucose, unit: { ...glucose.unit, rawSpan: "manual mg/dL selection", value: "MG_DL", confidence: 1, status: "provisional" } } });
                    setUnitPickerOpen(false);
                  }}>mg/dL</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {!glucose ? (
            <div className="field">
              <label htmlFor="manual-glucose">Enter current glucose manually</label>
              <input
                id="manual-glucose"
                type="number"
                inputMode="decimal"
                min="0"
                value={manualGlucose}
                onChange={(event) => setManualGlucose(event.target.value)}
                onBlur={() => {
                  const value = Number(manualGlucose);
                  if (Number.isFinite(value) && value > 0) updateGlucoseValue(value);
                }}
              />
            </div>
          ) : null}
          {recentInsulin ? <ExtractedRow label="Insulin already taken" value={`${recentInsulin.amountUnits.value ?? "?"} U`} detail={describeTimestamp(recentInsulin.takenAt.value, referenceNowMs)} selected={selectedRow === 1} onSelect={() => setSelectedRow(1)} /> : null}
        </section>

        <section className="card meal-breakdown" aria-label="Your meal">
          <h2>Your meal</h2>
          {resolvedComponents.length === 0 ? <p className="muted">No food or drink mentioned.</p> : null}
          {resolvedComponents.length > 0 && !allComponentsResolved ? (
            <p className="lifecycle-banner">I couldn't confidently interpret all of that meal. Check each ingredient before any carbohydrate total is shown.</p>
          ) : null}
          {resolvedComponents.map((component, index) => {
            const understood = component.component.quantity.value !== null || Boolean(component.component.qualifier) || !component.component.quantityNeededForCalculation;
            return (
              <div key={`${component.component.phrase}-${index}`} className="meal-item">
                <ExtractedRow
                  label={`${understood ? "✓" : "?"} ${component.component.phrase}`}
                  value={
                    !understood
                      ? "I couldn't determine the amount"
                      : component.carbohydrateGrams === null
                        ? describeFoodInterpretation(component)
                        : describeFoodInterpretation(component)
                  }
                  detail={
                    [
                      component.assumedPortion,
                      ...component.component.assumptions,
                      component.bestMatch ? component.bestMatch.label : "No match found",
                    ].filter(Boolean).join(" · ")
                  }
                  selected={selectedRow === index + 2}
                  onSelect={() => setSelectedRow(index + 2)}
                />
                {component.carbohydrateGrams !== null && allComponentsResolved ? (
                  <p className="meal-item__carbs">{component.carbohydrateGrams} g carbohydrate</p>
                ) : component.carbohydrateGrams !== null ? (
                  <p className="muted">Calculated only after every ingredient is confirmed.</p>
                ) : null}
                {selectedRow === index + 2 ? (
                  <div className="meal-item__edit">
                    <label htmlFor={`food-name-${index}`}>Food</label>
                    <input
                      id={`food-name-${index}`}
                      defaultValue={component.component.phrase}
                      onBlur={(event) => {
                        const phrase = event.target.value.trim();
                        if (phrase && phrase !== component.component.phrase) void updateComponentAt(index, { phrase });
                      }}
                    />
                    <label htmlFor={`food-qty-${index}`}>Quantity</label>
                    <input
                      id={`food-qty-${index}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      defaultValue={component.component.quantity.value ?? ""}
                      onBlur={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value) && value > 0) void updateComponentAt(index, { value });
                      }}
                    />
                    <label htmlFor={`food-unit-${index}`}>Unit</label>
                    <select
                      id={`food-unit-${index}`}
                      defaultValue={component.component.unit.value ?? "whole"}
                      onChange={(event) => void updateComponentAt(index, { value: component.component.quantity.value ?? 1, unit: event.target.value })}
                    >
                      <option value="whole">whole</option>
                      <option value="slices">slices</option>
                      <option value="grams">grams</option>
                      <option value="ml">ml</option>
                      <option value="tbsp">tablespoon</option>
                      <option value="tsp">teaspoon</option>
                      <option value="cup">cup</option>
                      <option value="serving">serving</option>
                    </select>
                  </div>
                ) : (
                  <p className="muted">Tap the ingredient to edit food, quantity, unit, or portion.</p>
                )}
                {component.requiresManualPortion && !brandedQuestionIndexes.has(index) && !onlineQuestionIndexes.has(index) ? (
                  <div className="field">
                    <label htmlFor={`grams-${index}`}>Portion grams</label>
                    <input id={`grams-${index}`} type="number" inputMode="decimal" min="0" value={manualGrams[index] ?? ""} onChange={(event) => setManualGrams((current) => ({ ...current, [index]: event.target.value }))} />
                    <button className="btn-secondary" type="button" disabled={busyIndex === index} onClick={() => {
                      const grams = Number(manualGrams[index]);
                      if (Number.isFinite(grams) && grams > 0) void updateComponentAt(index, { value: grams, unit: "grams" });
                    }}>Use this amount</button>
                  </div>
                ) : null}
                <button className="btn-secondary" type="button" onClick={() => setDetailsOpenIndex(detailsOpenIndex === index ? null : index)}>{detailsOpenIndex === index ? "Hide match details" : "Change or inspect match"}</button>
                {detailsOpenIndex === index ? (
                  <div className="muted">
                    {component.bestMatch ? <p>Match reason: {component.bestMatch.matchReason}</p> : null}
                    {component.bestMatch?.description ? <p>{component.bestMatch.description}</p> : null}
                    {component.alternates.length > 0 ? <p>Other possible matches: {component.alternates.map((alternate) => alternate.label).join(", ")}</p> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {resolvedComponents.length > 0 ? (
            allComponentsResolved ? (
              <div className="meal-total">
                <div className="muted">Meal carbohydrate</div>
                <div className="dose-display">{Math.round(totalCarbohydrateGrams * 10) / 10} g</div>
                <p className="muted">This total is the sum of the ingredients above. It is not an insulin dose.</p>
              </div>
            ) : (
              <p className="lifecycle-banner lifecycle-banner--halt">No carbohydrate total is shown until every significant ingredient is resolved.</p>
            )
          ) : null}
        </section>

            {nonBlockingClarifications.length > 0 ? <section className="card"><h2>Optional review</h2>{nonBlockingClarifications.map(renderClarification)}</section> : null}
      </ResultLayout>
    </Screen>
  );
}
