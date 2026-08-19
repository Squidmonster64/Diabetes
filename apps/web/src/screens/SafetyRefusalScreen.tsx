import { useNavigate } from "react-router-dom";
import { RefusalAperture } from "../components/Aperture.js";
import { RefusalCard } from "../components/RefusalCard.js";
import { ResultLayout } from "../components/ResultLayout.js";
import { Screen } from "../components/Screen.js";
import { useWorkflow } from "../state/WorkflowContext.js";

interface RefusalResult {
  status: "REFUSED";
  userFacingMessage: string;
  blockingReason: string;
  safeNextStep: string;
  refusalCategory: string;
  refusalCode: string;
}

export function SafetyRefusalScreen() {
  const { previewResult, reset } = useWorkflow();
  const navigate = useNavigate();
  const result = previewResult as RefusalResult | null;

  if (!result || result.status !== "REFUSED") {
    return (
      <Screen title="Calculation unavailable" showBack={false}>
        <p className="muted">No refusal record is available.</p>
      </Screen>
    );
  }

  const followSafeNextStep = () => {
    if (result.refusalCode === "NO_ACTIVE_CONFIGURATION") {
      navigate("/settings", { state: { returnTo: "/glucose-entry" } });
      return;
    }
    reset();
    navigate("/");
  };

  return (
    <Screen title="Calculation unavailable" className="screen--result" showBack={false}>
      <ResultLayout
        title="Calculation unavailable"
        tone="refusal"
        head={<RefusalAperture userFacingMessage={result.userFacingMessage} />}
        footer={
          <button className="btn-primary" type="button" onClick={followSafeNextStep}>
            {result.refusalCode === "NO_ACTIVE_CONFIGURATION" ? "Set up clinician baseline" : result.safeNextStep}
          </button>
        }
      >
        <RefusalCard
          blockingReason={result.blockingReason}
          safeNextStep={result.safeNextStep}
          refusalCategory={result.refusalCategory}
          refusalCode={result.refusalCode}
        />
      </ResultLayout>
    </Screen>
  );
}
