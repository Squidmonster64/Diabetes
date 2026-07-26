import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/apiClient.js";
import { useWorkflow, type PriorRapidActingDoseEntry } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

const SPECIAL_SITUATIONS = [
  "SICK_DAY",
  "SEVERE_ILLNESS",
  "KETONES",
  "VOMITING",
  "DEHYDRATION",
  "PREGNANCY",
  "PAEDIATRIC_USE",
  "EXERCISE_ADJUSTMENT",
  "ALCOHOL_ADJUSTMENT",
  "STEROID_ADJUSTMENT",
  "PUMP_OR_AID",
  "BASAL_OR_PREMIXED_INSULIN",
  "CONCENTRATED_INSULIN_AMBIGUITY",
  "UNCONSCIOUS_OR_UNABLE_TO_SWALLOW",
  "OTHER_TREATMENT_PLAN",
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

export function GlucoseEntryScreen() {
  const { carbResult, glucoseEntry, setPreviewResult } = useWorkflow();
  const navigate = useNavigate();

  const [glucoseUnit, setGlucoseUnit] = useState<"MMOL_L" | "MG_DL">(glucoseEntry?.glucoseUnit ?? "MMOL_L");
  const [currentGlucose, setCurrentGlucose] = useState(glucoseEntry?.currentGlucose ?? "");
  const [glucoseConfirmed, setGlucoseConfirmed] = useState(false);
  const [carbsConfirmed, setCarbsConfirmed] = useState(false);
  const [noActiveInsulin, setNoActiveInsulin] = useState(true);
  const [activeInsulinUnits, setActiveInsulinUnits] = useState("");
  const [priorRapidActingDoses, setPriorRapidActingDoses] = useState<PriorRapidActingDoseEntry[]>(
    glucoseEntry?.priorRapidActingDoses ? [...glucoseEntry.priorRapidActingDoses] : [],
  );
  const [recentHistoryComplete, setRecentHistoryComplete] = useState(false);
  const [hypoSymptoms, setHypoSymptoms] = useState(glucoseEntry?.hypoSymptoms ?? false);
  const [duplicateDose, setDuplicateDose] = useState(false);
  const [concentratedInsulinConfirmed, setConcentratedInsulinConfirmed] = useState(false);
  const [situations, setSituations] = useState<Set<string>>(new Set(glucoseEntry?.specialSituations ?? []));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getCurrentSettings()
      .then((settings) => {
        const unit = (settings as { glucoseUnit?: "MMOL_L" | "MG_DL" }).glucoseUnit;
        if (unit) setGlucoseUnit(unit);
      })
      .catch(() => {
        // No active settings yet - fall through and let the calculation refuse with a clear message.
      });
  }, []);

  const toggleSituation = (situation: string) => {
    setSituations((prev) => {
      const next = new Set(prev);
      if (next.has(situation)) next.delete(situation);
      else next.add(situation);
      return next;
    });
  };

  const carbGrams = carbResult?.carbohydrateGrams ?? 0;
  const mode = carbGrams > 0 ? "MEAL" : "CORRECTION_ONLY";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const nowTs = nowIso();
      const body = {
        mode,
        currentGlucose,
        glucoseUnit,
        glucoseTimestamp: nowTs,
        glucoseSource: "MANUAL_TRANSCRIPTION",
        glucoseConfirmed,
        carbohydrateGrams: String(carbGrams),
        carbohydratesConfirmed: carbsConfirmed,
        activeInsulinUnits: noActiveInsulin ? "0" : activeInsulinUnits || null,
        recentHistoryComplete,
        priorRapidActingDoses,
        hypoSymptoms,
        duplicateDose,
        specialSituations: Array.from(situations),
        concentratedInsulinConfirmed,
        calculatedAt: nowTs,
      };
      const result = await api.previewBolus(body);
      setPreviewResult(result);
      const status = (result as { status: string }).status;
      const warnings = (result as { warnings?: unknown[] }).warnings ?? [];
      if (status === "REFUSED") navigate("/safety-refusal");
      else if (warnings.length > 0) navigate("/safety-warning");
      else navigate("/bolus-preview");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Could not calculate a bolus preview.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title="Glucose and active insulin">
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="muted">Carbohydrate confirmed</div>
          <div>{carbGrams} g ({mode === "MEAL" ? "meal" : "correction only"})</div>
        </div>

        <div className="field">
          <label htmlFor="glucose">Current glucose ({glucoseUnit === "MMOL_L" ? "mmol/L" : "mg/dL"})</label>
          <input
            id="glucose"
            type="number"
            inputMode="decimal"
            required
            value={currentGlucose}
            onChange={(event) => setCurrentGlucose(event.target.value)}
          />
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={glucoseConfirmed} onChange={(e) => setGlucoseConfirmed(e.target.checked)} />
          <span>I confirm this current glucose value is correct.</span>
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={carbsConfirmed} onChange={(e) => setCarbsConfirmed(e.target.checked)} />
          <span>I confirm the carbohydrate amount above is correct.</span>
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={noActiveInsulin} onChange={(e) => setNoActiveInsulin(e.target.checked)} />
          <span>I have no potentially active rapid-acting insulin from a prior dose.</span>
        </label>
        {!noActiveInsulin ? (
          <div className="field">
            <label htmlFor="activeInsulin">Active insulin units (if known)</label>
            <input
              id="activeInsulin"
              type="number"
              inputMode="decimal"
              value={activeInsulinUnits}
              onChange={(event) => setActiveInsulinUnits(event.target.value)}
            />
          </div>
        ) : null}

        {priorRapidActingDoses.length > 0 ? (
          <div className="card">
            <div className="muted">Recent rapid-acting doses on record for this event</div>
            {priorRapidActingDoses.map((dose, index) => (
              <div className="checkbox-row" key={`${dose.administeredAt}-${index}`}>
                <span>
                  {dose.units} units at {new Date(dose.administeredAt).toLocaleString()}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPriorRapidActingDoses((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={recentHistoryComplete}
            onChange={(e) => setRecentHistoryComplete(e.target.checked)}
          />
          <span>I confirm my recent rapid-acting insulin history is complete and up to date.</span>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={concentratedInsulinConfirmed}
            onChange={(e) => setConcentratedInsulinConfirmed(e.target.checked)}
          />
          <span>I confirm this is my standard rapid-acting insulin (not concentrated).</span>
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={duplicateDose} onChange={(e) => setDuplicateDose(e.target.checked)} />
          <span>A dose may already have been taken for this event.</span>
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={hypoSymptoms} onChange={(e) => setHypoSymptoms(e.target.checked)} />
          <span>I have hypoglycaemia symptoms right now.</span>
        </label>

        <details style={{ marginBottom: "1rem" }}>
          <summary className="muted">Other clinical situations (optional)</summary>
          {SPECIAL_SITUATIONS.map((situation) => (
            <label className="checkbox-row" key={situation}>
              <input
                type="checkbox"
                checked={situations.has(situation)}
                onChange={() => toggleSituation(situation)}
              />
              <span>{situation.replaceAll("_", " ").toLowerCase()}</span>
            </label>
          ))}
        </details>

        {error ? <div className="banner banner-danger">{error}</div> : null}

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Calculating…" : "Calculate bolus preview"}
        </button>
      </form>
    </Screen>
  );
}
