import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  generateClarifications,
  hasBlockingClarifications,
  parseTimeExpression,
  type ClarificationQuestion,
  type ProvisionalEvent,
} from "@diabetes-companion/natural-language";
import { resolveFoodComponent, type ResolvedFoodComponent } from "../lib/foodMatch.js";
import { useNaturalLanguageDraft } from "../state/NaturalLanguageContext.js";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

function describeTimestamp(iso: string | null, referenceNowMs: number): string {
  if (!iso) return "not stated";
  const deltaMs = referenceNowMs - Date.parse(iso);
  const minutes = Math.round(deltaMs / 60_000);
  if (Math.abs(minutes) < 2) return "just now";
  if (minutes > 0 && minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (minutes > 0 && hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleString();
}

/**
 * The review screen every natural-language event must pass through before
 * any carbohydrate is calculated. Nothing here is auto-confirmed: glucose,
 * insulin history, and every meal component are shown as reviewable,
 * editable fields, and any blocking clarification must be answered before
 * the single confirm button is enabled. This screen never calculates or
 * infers a dose - it only assembles a confirmed carbohydrate total and
 * hands the rest (glucose value, prior insulin doses, symptoms) to the
 * existing, unmodified glucose-entry / bolus-safety-gate flow.
 */
export function NaturalLanguageReviewScreen() {
  const { provisionalEvent, resolvedComponents, setDraft } = useNaturalLanguageDraft();
  const { setCarbResult, setGlucoseEntry } = useWorkflow();
  const navigate = useNavigate();
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [manualGrams, setManualGrams] = useState<Record<number, string>>({});
  const [detailsOpenIndex, setDetailsOpenIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const referenceNowMs = provisionalEvent ? Date.parse(provisionalEvent.referenceNow) : Date.now();

  const applyEventChange = (updated: Partial<Pick<ProvisionalEvent, "glucose" | "recentInsulin" | "meal">>) => {
    if (!provisionalEvent) return;
    const next: ProvisionalEvent = { ...provisionalEvent, ...updated };
    const clarifications = generateClarifications({ glucose: next.glucose, recentInsulin: next.recentInsulin, meal: next.meal });
    setDraft({ ...next, clarifications }, resolvedComponents);
  };

  const updateComponentAt = async (index: number, patch: { value: number; unit?: string | null }) => {
    if (!provisionalEvent?.meal) return;
    const meal = provisionalEvent.meal;
    const components = meal.components.map((component, i) =>
      i === index
        ? {
            ...component,
            quantity: { ...component.quantity, value: patch.value, status: "provisional" as const },
            unit: patch.unit ? { ...component.unit, value: patch.unit, status: "provisional" as const } : component.unit,
            matchStatus: "provisional" as const,
          }
        : component,
    );

    setBusyIndex(index);
    try {
      const updated = await resolveFoodComponent(components[index]!);
      const nextResolved = resolvedComponents.map((rc, i) => (i === index ? updated : rc));
      const updatedMeal = { ...meal, components };
      const nextClarifications = generateClarifications({
        glucose: provisionalEvent.glucose,
        recentInsulin: provisionalEvent.recentInsulin,
        meal: updatedMeal,
      });
      setDraft({ ...provisionalEvent, meal: updatedMeal, clarifications: nextClarifications }, nextResolved);
    } finally {
      setBusyIndex(null);
    }
  };

  if (!provisionalEvent) {
    return (
      <Screen title="Review details">
        <p className="muted">Nothing to review yet.</p>
        <button className="btn-primary" onClick={() => navigate("/describe")}>
          Describe an event
        </button>
      </Screen>
    );
  }

  const { glucose, recentInsulin, symptoms, clarifications, correctionsApplied } = provisionalEvent;

  const totalCarbohydrateGrams = resolvedComponents.reduce((sum, rc) => sum + (rc.carbohydrateGrams ?? 0), 0);
  const allComponentsResolved = resolvedComponents.every((rc) => rc.carbohydrateGrams !== null);
  const blocked = hasBlockingClarifications(provisionalEvent) || !allComponentsResolved;

  const renderClarification = (clarification: ClarificationQuestion) => {
    if (clarification.field === "glucose.unit") {
      return (
        <div className="field" key={clarification.field}>
          <div>{clarification.question}</div>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => glucose && applyEventChange({ glucose: { ...glucose, unit: { ...glucose.unit, value: "MMOL_L", status: "provisional" } } })}
          >
            mmol/L
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => glucose && applyEventChange({ glucose: { ...glucose, unit: { ...glucose.unit, value: "MG_DL", status: "provisional" } } })}
          >
            mg/dL
          </button>
        </div>
      );
    }

    if (clarification.field === "recentInsulin.amountUnits") {
      return (
        <div className="field" key={clarification.field}>
          <label>{clarification.question}</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (recentInsulin && Number.isFinite(value) && value > 0) {
                applyEventChange({
                  recentInsulin: { ...recentInsulin, amountUnits: { ...recentInsulin.amountUnits, value, status: "provisional" } },
                });
              }
            }}
          />
        </div>
      );
    }

    if (clarification.field === "recentInsulin.takenAt") {
      return (
        <div className="field" key={clarification.field}>
          <label>{clarification.question}</label>
          <input
            type="text"
            placeholder="e.g. 2 hours ago, or at 3pm"
            onBlur={(event) => {
              if (!recentInsulin || !event.target.value.trim()) return;
              const parsed = parseTimeExpression(event.target.value, referenceNowMs);
              if (parsed.value) {
                applyEventChange({ recentInsulin: { ...recentInsulin, takenAt: parsed } });
              }
            }}
          />
        </div>
      );
    }

    if (clarification.field === "recentInsulin.insulinType") {
      return (
        <div className="field" key={clarification.field}>
          <div>{clarification.question}</div>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => recentInsulin && applyEventChange({ recentInsulin: { ...recentInsulin, concentratedInsulinAmbiguity: false } })}
          >
            Standard concentration
          </button>
          <div className="banner banner-warning" style={{ marginTop: "0.5rem" }}>
            If this is a concentrated insulin (U-500/U-200), do not use this calculator - follow your clinician's
            specific concentrated-insulin dosing plan instead.
          </div>
        </div>
      );
    }

    // Meal-component clarifications: a plain quantity input, per whichever component this targets.
    const match = clarification.field.match(/^meal\.components\[(\d+)\]/);
    if (match) {
      const index = Number(match[1]);
      return (
        <div className="field" key={clarification.field}>
          <label>{clarification.question}</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) void updateComponentAt(index, { value });
            }}
          />
        </div>
      );
    }

    return (
      <div className="field" key={clarification.field}>
        {clarification.question}
      </div>
    );
  };

  const handleManualGrams = async (index: number) => {
    const gramsText = manualGrams[index];
    const grams = Number(gramsText);
    if (!Number.isFinite(grams) || grams <= 0) return;
    await updateComponentAt(index, { value: grams, unit: "grams" });
  };

  const handleConfirm = () => {
    if (blocked) return;
    setError(null);

    setCarbResult({
      sourceDataset: "AUSNUT_2023",
      sourceFoodId: "natural-language-entry",
      foodName: "Described meal",
      brand: null,
      portionDescription: resolvedComponents
        .map((rc) => `${rc.component.phrase}${rc.bestMatch ? ` (${rc.bestMatch.label})` : ""}`)
        .join(", "),
      portionQuantity: 1,
      portionGrams: null,
      portionMillilitres: null,
      carbohydrateGrams: Math.round(totalCarbohydrateGrams * 10) / 10,
      carbohydrateDefinition: "available_carbohydrate_without_sugar_alcohols",
      provenance: { database: "australian_foods.sqlite", sourceObject: "natural_language_review", databaseSha256: "" },
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
      // A genuine safety attestation - always left for the user to tick
      // explicitly on the next screen, never pre-confirmed here.
      concentratedInsulinConfirmed: false,
      priorRapidActingDoses:
        recentInsulin && recentInsulin.amountUnits.value !== null && recentInsulin.takenAt.value !== null
          ? [{ units: String(recentInsulin.amountUnits.value), administeredAt: recentInsulin.takenAt.value }]
          : [],
      specialSituations: symptoms.specialSituations,
    });

    navigate("/glucose-entry");
  };

  return (
    <Screen title="Review details">
      <p className="muted">You said: "{provisionalEvent.originalText}"</p>

      {correctionsApplied.length > 0 ? (
        <div className="banner banner-success">
          Applied {correctionsApplied.length} correction{correctionsApplied.length === 1 ? "" : "s"} from what you said.
        </div>
      ) : null}

      <div className="card">
        <h3>Glucose</h3>
        {glucose ? (
          <>
            <div>
              {glucose.value.value ?? "?"} {glucose.unit.value === "MG_DL" ? "mg/dL" : glucose.unit.value === "MMOL_L" ? "mmol/L" : "(unit needed)"}
            </div>
            <div className="muted">{describeTimestamp(glucose.timestamp.value, referenceNowMs)}</div>
          </>
        ) : (
          <div className="muted">No glucose reading mentioned - you can enter it on the next screen.</div>
        )}
      </div>

      {recentInsulin ? (
        <div className="card">
          <h3>Recent insulin</h3>
          <div>
            {recentInsulin.amountUnits.value ?? "?"} units
            {recentInsulin.insulinType.value ? ` (${recentInsulin.insulinType.value})` : ""}
          </div>
          <div className="muted">{describeTimestamp(recentInsulin.takenAt.value, referenceNowMs)}</div>
        </div>
      ) : null}

      <div className="card">
        <h3>Meal</h3>
        {resolvedComponents.length === 0 ? (
          <div className="muted">No food or drink mentioned.</div>
        ) : (
          resolvedComponents.map((rc: ResolvedFoodComponent, index: number) => (
            <div className="card" key={`${rc.component.phrase}-${index}`}>
              <div>
                <strong>{rc.component.phrase}</strong>
                {rc.component.quantity.value !== null
                  ? ` - ${rc.component.quantity.value}${rc.component.unit.value ? ` ${rc.component.unit.value}` : ""}`
                  : rc.component.qualifier
                    ? ` - ${rc.component.qualifier}`
                    : ""}
              </div>
              {rc.bestMatch ? (
                <div className="muted">
                  Matched: {rc.bestMatch.label}
                  {rc.bestMatch.brand ? ` (${rc.bestMatch.brand})` : ""}
                </div>
              ) : (
                <div className="muted">No match found yet.</div>
              )}
              <div>
                {rc.carbohydrateGrams !== null ? (
                  <span>{rc.carbohydrateGrams} g carbohydrate</span>
                ) : (
                  <span className="badge">Needs review</span>
                )}
              </div>

              {rc.requiresManualPortion ? (
                <div className="field">
                  <label>Grams</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={manualGrams[index] ?? ""}
                    onChange={(event) => setManualGrams((prev) => ({ ...prev, [index]: event.target.value }))}
                  />
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={busyIndex === index}
                    onClick={() => void handleManualGrams(index)}
                  >
                    Use this amount
                  </button>
                </div>
              ) : null}

              <button className="btn-secondary" type="button" onClick={() => setDetailsOpenIndex(detailsOpenIndex === index ? null : index)}>
                {detailsOpenIndex === index ? "Hide details" : rc.alternates.length > 0 ? "Change / Why this match?" : "Details"}
              </button>

              {detailsOpenIndex === index ? (
                <div>
                  {rc.bestMatch ? <p className="muted">Why this match: {rc.bestMatch.matchReason}</p> : null}
                  {rc.alternates.length > 0 ? (
                    <>
                      <p className="muted">Other possible matches:</p>
                      {rc.alternates.map((alternate) => (
                        <div className="muted" key={alternate.label}>
                          {alternate.label}
                          {alternate.brand ? ` (${alternate.brand})` : ""}
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {clarifications.length > 0 ? (
        <div className="card">
          <h3>A few things to confirm</h3>
          {clarifications.map(renderClarification)}
        </div>
      ) : null}

      {error ? <div className="banner banner-danger">{error}</div> : null}

      <button className="btn-primary" type="button" disabled={blocked} onClick={handleConfirm}>
        Confirm details and calculate carbohydrate
      </button>
    </Screen>
  );
}
