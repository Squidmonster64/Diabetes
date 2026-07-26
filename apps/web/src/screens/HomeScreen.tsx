import { Link } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

export function HomeScreen() {
  const { reset } = useWorkflow();
  return (
    <Screen title="Home" showBack={false}>
      <p className="muted">
        This calculator performs arithmetic only. Review every calculation before confirming. It does not replace
        clinical advice or your emergency/hypo plan.
      </p>
      <div className="field">
        <Link to="/food/search" onClick={reset}>
          <button className="btn-primary">Start a bolus calculation</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/history">
          <button className="btn-secondary">View history</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/settings">
          <button className="btn-secondary">Clinician-report settings</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/about">
          <button className="btn-secondary">About, safety and limitations</button>
        </Link>
      </div>
    </Screen>
  );
}
