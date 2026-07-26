import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

interface RefusalResult {
  status: "REFUSED";
  userFacingMessage: string;
  safeNextStep: string;
  refusalCode: string;
}

export function SafetyRefusalScreen() {
  const { previewResult, reset } = useWorkflow();
  const navigate = useNavigate();
  const result = previewResult as RefusalResult | null;

  const goHome = () => {
    reset();
    navigate("/");
  };

  return (
    <Screen title="Calculation unavailable" showBack={false}>
      <div className="banner banner-danger">{result?.userFacingMessage ?? "No calculation was produced."}</div>
      <p>{result?.safeNextStep}</p>
      <p className="muted">
        This calculator does not replace emergency services or clinical advice. If you believe this is an
        emergency, seek urgent assistance now.
      </p>
      <button className="btn-secondary" onClick={goHome}>
        Return home
      </button>
    </Screen>
  );
}
