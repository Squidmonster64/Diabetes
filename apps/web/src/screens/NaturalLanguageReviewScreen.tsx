import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  generateClarifications,
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

/** Every parsed value stays editable and remains a reviewable draft until the
 * explicit hand-off to glucose entry. This component never calculates a dose. */
export function NaturalLanguageReviewScreen() {
  const { provisionalEvent, resolvedComponents, setDraft } = useNaturalLanguageDraft();
  const { setCarbResult, setGlucoseEntry } = useWorkflow();
  const navigate = useNavigate();
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [manualGrams, setManualGrams] = useState<Record<number, string>>({});
  const [manualGlucose, setManualGlucose] = useState("");
  const [detailsOpenIndex, setDetailsOpenIndex] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [savedGlucoseUnit, setSavedGlucoseUnit] = useState<"MMOL_L" | "MG_DL" | null>(null);
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [subwaySizeByIndex, setSubwaySizeByIndex] = useState<Record<number, "SIX_INCH" | "FOOTLONG">>({});
  const [subwaySelectionByIndex, setSubwaySelectionByIndex] = useState<Record<number, string>>({});

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

  const updateComponentAt = async (index: number, patch: { value: number; unit?: string | null }) => {
    if (!provisionalEvent?.meal) return;
    const components = provisionalEvent.meal.components.map((component, i) =>
      i === index
        ? {
            ...component,
            quantity: { ...component.quantity, value: patch.value, status: "provisional" as const },
            unit: patch.unit ? { ...component.unit, value: patch.unit, status: "provisional" as const } : component.unit,
            quantityKind: patch.unit === "grams" ? "GRAMS" as const : patch.unit === "ml" ? "MILLILITRES" as const : component.quantityKind,
            selectedServingMeasureId: patch.unit ? null : component.selectedServingMeasureId,
            matchStatus: "provisional" as const,
          }
        : component,
    );

    setBusyIndex(index);
    try {
      const updated = await resolveFoodComponent(components[index]!);
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
    };
    const nextResolved = resolvedComponents.map((component, componentIndex) => (componentIndex === index ? selectedComponent : component));
    const meal = { ...provisionalEvent.meal, components };
    const next = { ...provisionalEvent, meal };
    setDraft({ ...next, clarifications: generateClarifications(next) }, nextResolved);
    setQuestionsOpen(false);
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
  const blockingClarifications = clarifications.filter(
    (clarification) =>
      clarification.blocking &&
      ![...brandedQuestionIndexes].some((index) => clarification.field.startsWith(`meal.components[${index}]`)),
  );
  const nonBlockingClarifications = clarifications.filter((clarification) => !clarification.blocking);
  const questionCount = blockingClarifications.length + brandedQuestionIndexes.size;
  const blocked = blockingClarifications.length > 0 || !allComponentsResolved;
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

  const handOffConfirmedDraft = () => {
    if (blocked) return;
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
    });
    navigate("/glucose-entry");
  };

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
            {questionsOpen ? (
              <section className="question-panel" aria-label="Questions needing your answer">
                <h2>One quick question at a time</h2>
                {[...brandedQuestionIndexes].map(renderSubwayQuestion)}
                {blockingClarifications.map(renderClarification)}
              </section>
            ) : null}
            {blocked && !questionsOpen ? <p className="muted">{questionCount} specific question{questionCount === 1 ? " needs" : "s need"} your answer before you continue.</p> : null}
            {blocked ? <button className="btn-secondary" type="button" onClick={() => setQuestionsOpen((current) => !current)}>{questionsOpen ? "Hide questions" : `Answer ${questionCount} question${questionCount === 1 ? "" : "s"}`}</button> : null}
            <button className="btn-primary" type="button" disabled={blocked} onClick={handOffConfirmedDraft}>Confirm these values</button>
          </>
        }
      >
        <div className="lifecycle-banner">Nothing has been calculated yet. No insulin dose is suggested on this screen.</div>
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

        <section className="card">
          <h2>Food</h2>
          {resolvedComponents.length === 0 ? <p className="muted">No food or drink mentioned.</p> : null}
          {resolvedComponents.map((component, index) => (
            <div key={`${component.component.phrase}-${index}`}>
              <ExtractedRow
                label={describeFoodInterpretation(component)}
                value={component.carbohydrateGrams === null ? "Carbohydrate amount pending" : `${component.carbohydrateGrams} g carb`}
                detail={component.bestMatch ? `${component.bestMatch.label}${component.bestMatch.brand ? ` · ${component.bestMatch.brand}` : ""}` : "No match found"}
                selected={selectedRow === index + 2}
                onSelect={() => setSelectedRow(index + 2)}
              />
              {component.requiresManualPortion && !brandedQuestionIndexes.has(index) ? (
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
          ))}
        </section>

            {nonBlockingClarifications.length > 0 ? <section className="card"><h2>Optional review</h2>{nonBlockingClarifications.map(renderClarification)}</section> : null}
      </ResultLayout>
    </Screen>
  );
}
