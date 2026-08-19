import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Aperture } from "../components/Aperture.js";
import { LifecycleBanner } from "../components/ReviewPrimitives.js";
import { ResultLayout } from "../components/ResultLayout.js";
import { Screen } from "../components/Screen.js";
import { api, ApiError } from "../lib/apiClient.js";
import { useWorkflow } from "../state/WorkflowContext.js";

interface PreviewSuccess {
  calculationId: string;
  roundedTotalUnits: string;
  snapshotHash: string;
  expiresAt: string;
  timestamp?: string;
  serverNow?: string;
}

export function ConfirmationScreen() {
  const { previewResult, setPreviewResult } = useWorkflow();
  const navigate = useNavigate();
  const result = previewResult as PreviewSuccess | null;
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationRequestId] = useState(() => crypto.randomUUID());

  if (!result) return <Screen title="Confirmation"><p className="muted">No preview to confirm.</p></Screen>;

  const confirm = async () => {
    if (!navigator.onLine) {
      setError("Confirmation is unavailable while offline. Reconnect before confirming this calculation.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const confirmation = await api.confirmBolus(result.calculationId, {
        confirmationRequestId,
        expectedSnapshotHash: result.snapshotHash,
      });
      setPreviewResult({ ...result, confirmation, lifecycleStatus: (confirmation as { status?: string }).status ?? "USER_CONFIRMED" });
      navigate("/confirm-result");
    } catch (err) {
      if (err instanceof ApiError && err.code === "CALCULATION_EXPIRED") {
        setPreviewResult({ status: "EXPIRED" });
        navigate("/bolus-preview");
        return;
      }
      setError(err instanceof Error ? err.message : "Confirmation failed. No record was created.");
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    if (!navigator.onLine) {
      setError("Rejection is unavailable while offline. Reconnect before changing this preview.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.rejectBolus(result.calculationId, { reason: "USER_REJECTED" });
      setPreviewResult({ status: "INVALIDATED" });
      navigate("/glucose-entry");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invalidate this preview.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title="Confirm calculation" className="screen--result" showBack={false}>
      <ResultLayout
        title="Confirm calculation"
        head={<Aperture roundedTotalUnits={result.roundedTotalUnits} expiresAt={result.expiresAt} serverNow={result.serverNow ?? result.timestamp} />}
        footer={
          <>
            {error ? <div className="banner banner-danger">{error}</div> : null}
            <button className="btn-primary" type="button" disabled={!accepted || submitting} onClick={() => void confirm()}>
              Confirm calculation
            </button>
            <button className="btn-secondary" type="button" disabled={submitting} onClick={() => void reject()}>
              Reject calculation
            </button>
          </>
        }
      >
        <LifecycleBanner status="USER_CONFIRMED">Confirmation records the reviewed calculation. It does not record insulin administration.</LifecycleBanner>
        <label className="checkbox-row">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>I have checked the glucose, carbohydrates, recent insulin and calculation.</span>
        </label>
      </ResultLayout>
    </Screen>
  );
}
