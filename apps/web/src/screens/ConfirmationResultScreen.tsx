import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LifecycleBanner, NumberPad } from "../components/ReviewPrimitives.js";
import { ResultLayout } from "../components/ResultLayout.js";
import { Screen } from "../components/Screen.js";
import { api } from "../lib/apiClient.js";
import { useWorkflow } from "../state/WorkflowContext.js";

interface ConfirmationState {
  calculationId: string;
  roundedTotalUnits: string;
  lifecycleStatus?: string;
  confirmation?: { status?: string; record?: { calculationId?: string } };
}

export function ConfirmationResultScreen() {
  const { previewResult, setPreviewResult, reset } = useWorkflow();
  const navigate = useNavigate();
  const result = previewResult as ConfirmationState | null;
  const [administeredUnits, setAdministeredUnits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!result) return <Screen title="Confirmation"><p className="muted">No confirmation record is available.</p></Screen>;

  const status = result.lifecycleStatus ?? result.confirmation?.status ?? "USER_CONFIRMED";
  const calculationId = result.confirmation?.record?.calculationId ?? result.calculationId;

  if (status === "DUPLICATE_CONFIRMATION") {
    return (
      <Screen title="Existing confirmation" className="screen--result" showBack={false}>
        <ResultLayout
          title="Existing confirmation"
          tone="settled"
          head={<h2 className="aperture__refusal">A confirmation record already exists.</h2>}
          footer={<button className="btn-primary" type="button" onClick={() => navigate(`/history/${calculationId}`)}>View existing record</button>}
        >
          <LifecycleBanner status="DUPLICATE_CONFIRMATION">No second confirmation was created.</LifecycleBanner>
        </ResultLayout>
      </Screen>
    );
  }

  if (status === "ADMINISTRATION_RECORDED") {
    return (
      <Screen title="Administration recorded" className="screen--result" showBack={false}>
        <ResultLayout
          title="Administration recorded"
          tone="settled"
          head={<h2 className="aperture__refusal">Administration recorded</h2>}
          footer={<button className="btn-primary" type="button" onClick={() => { reset(); navigate("/history"); }}>View ledger</button>}
        >
          <LifecycleBanner status="ADMINISTRATION_RECORDED">The record was acknowledged before it was shown. Corrections are recorded as new events; this record is not overwritten.</LifecycleBanner>
        </ResultLayout>
      </Screen>
    );
  }

  const recordAdministration = async () => {
    if (!navigator.onLine) {
      setError("Administration recording is unavailable while offline. Reconnect before recording.");
      return;
    }
    if (!administeredUnits) {
      setError("Enter the amount actually administered before recording it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const record = await api.recordAdministration({ calculationId, administeredUnits });
      setPreviewResult({ ...result, lifecycleStatus: "ADMINISTRATION_RECORDED", administration: record });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Administration was not recorded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Confirmed calculation" className="screen--result" showBack={false}>
      <ResultLayout
        title="Confirmed calculation"
        tone="settled"
        head={<h2 className="aperture__refusal">Calculation confirmed</h2>}
        footer={
          <>
            {error ? <div className="banner banner-danger">{error}</div> : null}
            <button className="btn-primary" type="button" disabled={busy} onClick={() => void recordAdministration()}>
              Record administration
            </button>
            <button className="btn-secondary" type="button" disabled={busy} onClick={() => navigate("/history")}>View ledger without recording</button>
          </>
        }
      >
        <LifecycleBanner status="USER_CONFIRMED">This calculation is confirmed but no administration has been recorded.</LifecycleBanner>
        <p className="muted">Enter the amount actually administered. The calculated preview is not assumed to have been used.</p>
        <NumberPad value={administeredUnits} onChange={setAdministeredUnits} unit="units administered" />
      </ResultLayout>
    </Screen>
  );
}
