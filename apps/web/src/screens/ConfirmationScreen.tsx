import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/apiClient.js";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

interface PreviewSuccess {
  calculationId: string;
  roundedTotalUnits: string;
  snapshotHash: string;
}

export function ConfirmationScreen() {
  const { previewResult, setPreviewResult, reset } = useWorkflow();
  const navigate = useNavigate();
  const result = previewResult as PreviewSuccess | null;
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!result) {
    return (
      <Screen title="Confirmation">
        <p className="muted">No preview to confirm.</p>
      </Screen>
    );
  }

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const confirmedAt = new Date().toISOString();
      const confirmation = await api.confirmBolus(result.calculationId, {
        confirmedAt,
        expectedSnapshotHash: result.snapshotHash,
      });
      setPreviewResult({ ...result, confirmation });
      navigate("/confirm-result");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Confirmation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    setSubmitting(true);
    try {
      await api.rejectBolus(result.calculationId, { rejectedAt: new Date().toISOString(), reason: "USER_REJECTED" });
    } catch {
      // Rejection is best-effort from the UI's perspective; the calculation
      // was never confirmed either way, so no dose is recorded.
    } finally {
      reset();
      navigate("/");
    }
  };

  return (
    <Screen title="Confirm">
      <div className="dose-display">{result.roundedTotalUnits}</div>
      <div className="dose-unit">units - you are about to record this result</div>

      <label className="checkbox-row">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>I have checked the glucose, carbohydrates, recent insulin and calculation.</span>
      </label>

      {error ? <div className="banner banner-danger">{error}</div> : null}

      <button className="btn-primary" disabled={!accepted || submitting} onClick={confirm}>
        Confirm calculation
      </button>
      <div style={{ height: "0.75rem" }} />
      <button className="btn-secondary" disabled={submitting} onClick={reject}>
        Reject this calculation
      </button>
    </Screen>
  );
}
