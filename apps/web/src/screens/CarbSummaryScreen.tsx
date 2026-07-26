import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

export function CarbSummaryScreen() {
  const { carbResult } = useWorkflow();
  const navigate = useNavigate();

  if (!carbResult) {
    return (
      <Screen title="Carbohydrate summary">
        <p className="muted">No calculation available. Return to food search.</p>
      </Screen>
    );
  }

  return (
    <Screen title="Carbohydrate summary">
      <h2>{carbResult.foodName}</h2>
      <p className="muted">{carbResult.portionDescription}</p>
      <div className="dose-display">{carbResult.carbohydrateGrams} g</div>
      <div className="dose-unit">available carbohydrate</div>
      <div className="card">
        <div className="muted">Carbohydrate definition</div>
        <div>{carbResult.carbohydrateDefinition.replaceAll("_", " ")}</div>
      </div>
      <div className="card">
        <div className="muted">Source</div>
        <div>{carbResult.sourceDataset === "AUSNUT_2023" ? "AUSNUT 2023" : "AFCD Release 3"}</div>
        <div className="muted">{carbResult.provenance.sourceObject}</div>
      </div>
      <button className="btn-primary" onClick={() => navigate("/glucose-entry")}>
        Continue to glucose entry
      </button>
    </Screen>
  );
}
