import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

export function ConfirmationResultScreen() {
  const { reset } = useWorkflow();
  const navigate = useNavigate();

  const goHome = () => {
    reset();
    navigate("/");
  };

  return (
    <Screen title="Confirmed" showBack={false}>
      <div className="banner banner-success">
        This calculation has been recorded as a confirmed bolus event. It is not proof that insulin was
        administered.
      </div>
      <button className="btn-secondary" onClick={() => navigate("/history")}>
        View history
      </button>
      <div style={{ height: "0.75rem" }} />
      <button className="btn-primary" onClick={goHome}>
        Done
      </button>
    </Screen>
  );
}
