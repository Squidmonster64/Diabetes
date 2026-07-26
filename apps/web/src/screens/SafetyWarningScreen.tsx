import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

export function SafetyWarningScreen() {
  const { previewResult } = useWorkflow();
  const navigate = useNavigate();
  const warnings = ((previewResult as { warnings?: string[] })?.warnings ?? []) as string[];

  return (
    <Screen title="Before you continue">
      <div className="banner banner-warning">
        This calculation has warnings that do not change the arithmetic, but you should review them before
        continuing.
      </div>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning.replaceAll("_", " ").toLowerCase()}</li>
        ))}
      </ul>
      <button className="btn-primary" onClick={() => navigate("/bolus-preview")}>
        Continue to preview
      </button>
    </Screen>
  );
}
