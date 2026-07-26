import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

interface PreviewSuccess {
  status: "CALCULATED" | "CALCULATED_ZERO";
  roundedTotalUnits: string;
  mealComponentUnits: string;
  correctionComponentUnits: string;
  explanation: string[];
  expiresAt: string;
  calculationId: string;
}

export function BolusPreviewScreen() {
  const { previewResult } = useWorkflow();
  const navigate = useNavigate();
  const result = previewResult as PreviewSuccess | null;

  if (!result || result.status === undefined) {
    return (
      <Screen title="Bolus preview">
        <p className="muted">No preview available. Start again from food search.</p>
      </Screen>
    );
  }

  return (
    <Screen title="Bolus preview">
      <div className="banner banner-warning">
        Calculated bolus: {result.roundedTotalUnits} units. Review the calculation before confirming.
      </div>
      <div className="dose-display">{result.roundedTotalUnits}</div>
      <div className="dose-unit">units (rapid-acting insulin)</div>

      <div className="card">
        <div className="muted">Meal component</div>
        <div>{result.mealComponentUnits} U</div>
      </div>
      <div className="card">
        <div className="muted">Correction component</div>
        <div>{result.correctionComponentUnits} U</div>
      </div>

      <details>
        <summary className="muted">Calculation trace</summary>
        <ul className="explanation-list">
          {result.explanation.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </details>

      <p className="timestamp">This preview expires at {new Date(result.expiresAt).toLocaleTimeString()}.</p>

      <button className="btn-primary" onClick={() => navigate("/confirm")}>
        Review and confirm
      </button>
    </Screen>
  );
}
