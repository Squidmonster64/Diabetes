import { useNavigate, useParams } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

export function FoodDetailsScreen() {
  const { sourceDataset, sourceFoodId } = useParams();
  const { selectedFood } = useWorkflow();
  const navigate = useNavigate();

  if (!selectedFood) {
    return (
      <Screen title="Food details">
        <p className="muted">No food selected. Return to search.</p>
      </Screen>
    );
  }

  return (
    <Screen title="Food details">
      <h2>{selectedFood.foodName}</h2>
      {selectedFood.foodDescription ? <p className="muted">{selectedFood.foodDescription}</p> : null}
      <div className="card">
        <div className="muted">Source dataset</div>
        <div>{selectedFood.sourceDataset === "AUSNUT_2023" ? "AUSNUT 2023" : "AFCD Release 3"}</div>
      </div>
      <div className="card">
        <div className="muted">Source food ID</div>
        <div>{sourceFoodId ?? selectedFood.sourceFoodId}</div>
      </div>
      <div className="card">
        <div className="muted">Data available</div>
        <div>
          {selectedFood.hasGramData ? "Per-100g composition" : ""}
          {selectedFood.hasGramData && selectedFood.hasMillilitreData ? " · " : ""}
          {selectedFood.hasMillilitreData ? "Per-100mL composition" : ""}
        </div>
      </div>
      <button
        className="btn-primary"
        onClick={() => navigate(`/food/${sourceDataset}/${sourceFoodId}/portion`)}
      >
        Choose portion
      </button>
    </Screen>
  );
}
