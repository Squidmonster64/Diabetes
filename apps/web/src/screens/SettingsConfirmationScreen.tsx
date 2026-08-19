import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";
import type { SettingsDraft } from "./SettingsScreen.js";

export function SettingsConfirmationScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as (SettingsDraft & { returnTo?: string }) | undefined;
  const draft = state ? {
    icr: state.icr,
    isf: state.isf,
    targetGlucose: state.targetGlucose,
    insulinDurationHours: state.insulinDurationHours,
    doseIncrementUnits: state.doseIncrementUnits,
    maximumDoseUnits: state.maximumDoseUnits,
    lowGlucoseThreshold: state.lowGlucoseThreshold,
    glucoseUnit: state.glucoseUnit,
    insulinDurationEntrySource: state.insulinDurationEntrySource,
    insulinDurationSourceDate: state.insulinDurationSourceDate,
    insulinDurationSourceReference: state.insulinDurationSourceReference,
  } satisfies SettingsDraft : undefined;
  const returnTo = typeof state?.returnTo === "string" && state.returnTo.startsWith("/") ? state.returnTo : undefined;
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft) {
    return (
      <Screen title="Confirm settings">
        <p className="muted">No settings draft found. Return to settings entry.</p>
      </Screen>
    );
  }

  const rows: [string, string][] = [
    ["Glucose units", draft.glucoseUnit === "MMOL_L" ? "mmol/L" : "mg/dL"],
    ["Insulin-to-carbohydrate ratio", `${draft.icr} g/U`],
    ["Insulin sensitivity factor", draft.isf],
    ["Target glucose", draft.targetGlucose],
    ["Low-glucose threshold", draft.lowGlucoseThreshold],
    ["Insulin duration", `${draft.insulinDurationHours} h`],
    ["Dose increment", `${draft.doseIncrementUnits} U`],
    ["Maximum dose", `${draft.maximumDoseUnits} U`],
    ["DIA source", draft.insulinDurationEntrySource.replaceAll("_", " ").toLowerCase()],
  ];

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.createSettings({
        ...draft,
        insulinDurationSourceDate: draft.insulinDurationSourceDate || undefined,
        insulinDurationSourceReference: draft.insulinDurationSourceReference || undefined,
        insulinDurationPatientConfirmedAccurate: true,
      });
      navigate(returnTo ?? "/settings/history");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title="Confirm settings">
      <p className="muted">
        Patient-entered value copied from a clinician-approved report or treatment plan.
      </p>
      {rows.map(([label, value]) => (
        <div className="card" key={label}>
          <div className="muted">{label}</div>
          <div>{value}</div>
        </div>
      ))}

      <label className="checkbox-row">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>This DIA matches my current clinician advice, and all values above match my current clinician-approved plan.</span>
      </label>

      {error ? <div className="banner banner-danger">{error}</div> : null}

      <button className="btn-primary" disabled={!accepted || submitting} onClick={submit}>
        Save as a new settings version
      </button>
    </Screen>
  );
}
