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
      <div className="banner banner-warning">
        Beta. Not approved for clinical treatment use. Natural language can interpret what you said; only the deterministic calculator can produce a dose preview.
      </div>
      <p className="muted">
        Speak or type what is happening. Your original words are saved first. Review every extracted value before any carbohydrate or insulin arithmetic runs.
      </p>
      <div className="field">
        <Link to="/describe" onClick={resetAll}>
          <button className="btn-primary">Describe glucose, insulin and food</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/captures">
          <button className="btn-secondary">Review saved captures</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/food/search" onClick={resetAll}>
          <button className="btn-secondary">Search the food database manually</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/meals" onClick={resetAll}>
          <button className="btn-secondary">Use a saved recipe</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/history">
          <button className="btn-secondary">View calculation ledger</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/custom-foods">
          <button className="btn-secondary">My custom foods</button>
        </Link>
      </div>
      <div className="field">
        <Link to="/meals">
          <button className="btn-secondary">Create or manage recipes</button>
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
