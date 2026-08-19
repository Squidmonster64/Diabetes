import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Screen } from "../components/Screen.js";

export interface SettingsDraft {
  icr: string;
  isf: string;
  targetGlucose: string;
  insulinDurationHours: string;
  doseIncrementUnits: string;
  maximumDoseUnits: string;
  lowGlucoseThreshold: string;
  glucoseUnit: "MMOL_L" | "MG_DL";
  insulinDurationEntrySource: "PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION" | "PATIENT_ENTERED_FROM_CLINICIAN_REPORT";
  insulinDurationSourceDate: string;
  insulinDurationSourceReference: string;
}

const EMPTY: SettingsDraft = {
  icr: "",
  isf: "",
  targetGlucose: "",
  insulinDurationHours: "",
  doseIncrementUnits: "",
  maximumDoseUnits: "",
  lowGlucoseThreshold: "",
  glucoseUnit: "MMOL_L",
  insulinDurationEntrySource: "PATIENT_ENTERED_FROM_CLINICIAN_REPORT",
  insulinDurationSourceDate: "",
  insulinDurationSourceReference: "",
};

export function SettingsScreen() {
  const [draft, setDraft] = useState<SettingsDraft>(EMPTY);
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = typeof (location.state as { returnTo?: unknown } | null)?.returnTo === "string"
    ? (location.state as { returnTo: string }).returnTo
    : undefined;

  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const isComplete =
    draft.icr && draft.isf && draft.targetGlucose && draft.insulinDurationHours && draft.doseIncrementUnits &&
    draft.maximumDoseUnits && draft.lowGlucoseThreshold;

  return (
    <Screen title="Clinician-report settings">
      <div className="banner banner-warning">
        These values are patient-entered values copied from a current clinician-approved report or treatment plan.
        This app does not suggest, derive, or recommend any of these values.
      </div>
      {returnTo ? <p className="muted">After you review and explicitly save these clinician-approved baseline values, you will return to the calculator.</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          navigate("/settings/confirm", { state: { ...draft, returnTo } });
        }}
      >
        <div className="field">
          <label htmlFor="glucoseUnit">Glucose units</label>
          <select
            id="glucoseUnit"
            value={draft.glucoseUnit}
            onChange={(e) => set("glucoseUnit", e.target.value as SettingsDraft["glucoseUnit"])}
          >
            <option value="MMOL_L">mmol/L</option>
            <option value="MG_DL">mg/dL</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="icr">Insulin-to-carbohydrate ratio (g/U)</label>
          <input id="icr" inputMode="decimal" value={draft.icr} onChange={(e) => set("icr", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="isf">Insulin sensitivity factor</label>
          <input id="isf" inputMode="decimal" value={draft.isf} onChange={(e) => set("isf", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="targetGlucose">Target glucose</label>
          <input
            id="targetGlucose"
            inputMode="decimal"
            value={draft.targetGlucose}
            onChange={(e) => set("targetGlucose", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="lowGlucoseThreshold">Low-glucose threshold</label>
          <input
            id="lowGlucoseThreshold"
            inputMode="decimal"
            value={draft.lowGlucoseThreshold}
            onChange={(e) => set("lowGlucoseThreshold", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="insulinDurationHours">Insulin duration (hours)</label>
          <input
            id="insulinDurationHours"
            inputMode="decimal"
            value={draft.insulinDurationHours}
            onChange={(e) => set("insulinDurationHours", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="doseIncrementUnits">Dose increment (units)</label>
          <input
            id="doseIncrementUnits"
            inputMode="decimal"
            value={draft.doseIncrementUnits}
            onChange={(e) => set("doseIncrementUnits", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="maximumDoseUnits">Maximum dose (units)</label>
          <input
            id="maximumDoseUnits"
            inputMode="decimal"
            value={draft.maximumDoseUnits}
            onChange={(e) => set("maximumDoseUnits", e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="source">Insulin duration source</label>
          <select
            id="source"
            value={draft.insulinDurationEntrySource}
            onChange={(e) => set("insulinDurationEntrySource", e.target.value as SettingsDraft["insulinDurationEntrySource"])}
          >
            <option value="PATIENT_ENTERED_FROM_CLINICIAN_REPORT">Clinician-provided report/letter</option>
            <option value="PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION">Clinician consultation</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sourceDate">Report/consultation date (optional)</label>
          <input
            id="sourceDate"
            type="date"
            value={draft.insulinDurationSourceDate}
            onChange={(e) => set("insulinDurationSourceDate", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="sourceRef">Reference label (optional, non-sensitive)</label>
          <input
            id="sourceRef"
            placeholder="e.g. Clinic letter May 2026"
            value={draft.insulinDurationSourceReference}
            onChange={(e) => set("insulinDurationSourceReference", e.target.value)}
          />
        </div>

        <button className="btn-primary" type="submit" disabled={!isComplete}>
          Review before saving
        </button>
      </form>
    </Screen>
  );
}
