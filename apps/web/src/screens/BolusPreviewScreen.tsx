import { useNavigate } from "react-router-dom";
import { Aperture } from "../components/Aperture.js";
import { CalculationTrace } from "../components/CalculationTrace.js";
import { LifecycleBanner } from "../components/ReviewPrimitives.js";
import { ResultLayout } from "../components/ResultLayout.js";
import { Screen } from "../components/Screen.js";
import { useWorkflow } from "../state/WorkflowContext.js";

interface PreviewSuccess {
  status: "CALCULATED" | "CALCULATED_ZERO";
  roundedTotalUnits: string;
  unroundedTotalUnits?: string;
  mealComponentUnits: string;
  correctionComponentUnits: string;
  activeInsulinAdjustmentUnits?: string;
  explanation: string[];
  expiresAt: string;
  calculationId: string;
  timestamp?: string;
  serverNow?: string;
}

interface ExpiredPreview {
  status: "EXPIRED";
}

export function BolusPreviewScreen() {
  const { previewResult, setPreviewResult } = useWorkflow();
  const navigate = useNavigate();
  const result = previewResult as PreviewSuccess | ExpiredPreview | null;

  if (!result || result.status === undefined) {
    return (
      <Screen title="Bolus preview">
        <p className="muted">No preview available. Start again from food search.</p>
      </Screen>
    );
  }

  if (result.status === "EXPIRED") {
    return (
      <Screen title="Bolus preview" className="screen--result" showBack={false}>
        <ResultLayout
          title="Preview expired"
          tone="refusal"
          head={<h2 className="aperture__refusal">This preview expired</h2>}
          footer={
            <button className="btn-primary" type="button" onClick={() => navigate("/glucose-entry")}>
              Recalculate
            </button>
          }
        >
          <LifecycleBanner status="EXPIRED">
            The previous dose is no longer shown. Recalculate using the current details before continuing.
          </LifecycleBanner>
        </ResultLayout>
      </Screen>
    );
  }

  const expirePreview = () => setPreviewResult({ status: "EXPIRED" });

  return (
    <Screen title="Bolus preview" className="screen--result" showBack={false}>
      <ResultLayout
        title="Bolus preview"
        head={
          <Aperture
            roundedTotalUnits={result.roundedTotalUnits}
            expiresAt={result.expiresAt}
            serverNow={result.serverNow ?? result.timestamp}
            onExpired={expirePreview}
          />
        }
        footer={
          <>
            <button className="btn-primary" type="button" onClick={() => navigate("/confirm")}>
              Confirm this calculation
            </button>
            <button className="btn-secondary" type="button" onClick={() => navigate("/glucose-entry")}>
              Reject and change inputs
            </button>
          </>
        }
      >
        <LifecycleBanner status="USER_CONFIRMED">
          Review the calculation trace and your inputs before confirming. This preview is not an instruction to administer insulin.
        </LifecycleBanner>
        <CalculationTrace
          explanation={result.explanation}
          mealComponentUnits={result.mealComponentUnits}
          correctionComponentUnits={result.correctionComponentUnits}
          activeInsulinAdjustmentUnits={result.activeInsulinAdjustmentUnits}
          unroundedTotalUnits={result.unroundedTotalUnits}
        />
        <details className="card">
          <summary className="trace-summary">
            <span>Preview details</span>
            <span className="muted">View metadata</span>
          </summary>
          <p className="muted">Calculation ID: {result.calculationId}</p>
          <p className="muted">Preview expiry: {new Date(result.expiresAt).toLocaleTimeString()}</p>
        </details>
      </ResultLayout>
    </Screen>
  );
}
