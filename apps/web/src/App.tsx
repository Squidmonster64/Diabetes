import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./state/AuthContext.js";
import { WorkflowProvider } from "./state/WorkflowContext.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { FoodSearchScreen } from "./screens/FoodSearchScreen.js";
import { FoodResultsScreen } from "./screens/FoodResultsScreen.js";
import { FoodDetailsScreen } from "./screens/FoodDetailsScreen.js";
import { PortionSelectionScreen } from "./screens/PortionSelectionScreen.js";
import { CarbSummaryScreen } from "./screens/CarbSummaryScreen.js";
import { GlucoseEntryScreen } from "./screens/GlucoseEntryScreen.js";
import { BolusPreviewScreen } from "./screens/BolusPreviewScreen.js";
import { SafetyWarningScreen } from "./screens/SafetyWarningScreen.js";
import { SafetyRefusalScreen } from "./screens/SafetyRefusalScreen.js";
import { ConfirmationScreen } from "./screens/ConfirmationScreen.js";
import { ConfirmationResultScreen } from "./screens/ConfirmationResultScreen.js";
import { HistoryScreen } from "./screens/HistoryScreen.js";
import { HistoryEventDetailsScreen } from "./screens/HistoryEventDetailsScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { SettingsConfirmationScreen } from "./screens/SettingsConfirmationScreen.js";
import { SettingsHistoryScreen } from "./screens/SettingsHistoryScreen.js";
import { DataProvenanceScreen } from "./screens/DataProvenanceScreen.js";
import { AboutScreen } from "./screens/AboutScreen.js";

export function App() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <AuthScreen />;

  return (
    <WorkflowProvider>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/food/search" element={<FoodSearchScreen />} />
        <Route path="/food/results" element={<FoodResultsScreen />} />
        <Route path="/food/:sourceDataset/:sourceFoodId" element={<FoodDetailsScreen />} />
        <Route path="/food/:sourceDataset/:sourceFoodId/portion" element={<PortionSelectionScreen />} />
        <Route path="/carb-summary" element={<CarbSummaryScreen />} />
        <Route path="/glucose-entry" element={<GlucoseEntryScreen />} />
        <Route path="/bolus-preview" element={<BolusPreviewScreen />} />
        <Route path="/safety-warning" element={<SafetyWarningScreen />} />
        <Route path="/safety-refusal" element={<SafetyRefusalScreen />} />
        <Route path="/confirm" element={<ConfirmationScreen />} />
        <Route path="/confirm-result" element={<ConfirmationResultScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/history/:eventId" element={<HistoryEventDetailsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/settings/confirm" element={<SettingsConfirmationScreen />} />
        <Route path="/settings/history" element={<SettingsHistoryScreen />} />
        <Route path="/data-provenance" element={<DataProvenanceScreen />} />
        <Route path="/about" element={<AboutScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </WorkflowProvider>
  );
}
