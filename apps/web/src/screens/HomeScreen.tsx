import { Link } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext.js";
import { useNaturalLanguageDraft } from "../state/NaturalLanguageContext.js";
import { Screen } from "../components/Screen.js";

export function HomeScreen() {
  const { reset } = useWorkflow();
  const { reset: resetDraft } = useNaturalLanguageDraft();
  const resetAll = () => {
    reset();
    resetDraft();
  };
  return (
    <Screen title="Home" showBack={false}>
      <p className="muted">
        This calculator performs arithmetic only. Review every calculation before confirming. It does not replace
        clinical advice or your emergency/hypo plan.
      </p>
      <div className="field">
        <Link to="/describe" onClick={resetAll}>
          <button className="btn-primary">Describe glucose, insulin and food</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/food/search" onClick={resetAll}>
          <button className="btn-secondary">Search the food database manually</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/meals" onClick={resetAll}>
          <button className="btn-secondary">Use a saved meal</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/history">
          <button className="btn-secondary">View history</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/custom-foods">
          <button className="btn-secondary">My custom foods</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/meals">
          <button className="btn-secondary">Manage saved meals</button>
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
