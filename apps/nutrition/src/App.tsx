import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "./state/AuthContext.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { OnboardingScreen } from "./screens/OnboardingScreen.js";
import { TodayScreen } from "./screens/TodayScreen.js";
import { LogFoodScreen } from "./screens/LogFoodScreen.js";
import { ConfirmMealScreen } from "./screens/ConfirmMealScreen.js";
import { HistoryScreen, MealDetailScreen } from "./screens/HistoryScreen.js";
import { NutrientDetailScreen, TrendsScreen } from "./screens/TrendsScreen.js";
import { FoodsScreen } from "./screens/FoodsScreen.js";
import { ProfileScreen } from "./screens/ProfileScreen.js";
import { api } from "./lib/api.js";

export function App() {
  const { session, loading, localDev } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session && !localDev) return;
    void api.getProfile().then(({ profile }) => setOnboarded(profile.onboardingComplete)).catch(() => setOnboarded(false));
  }, [session, localDev, loading]);

  if (loading || ((session || localDev) && onboarded === null)) return null;
  if (!session && !localDev) return <AuthScreen />;
  if (!onboarded) return <OnboardingScreen />;

  return (
    <Routes>
      <Route path="/" element={<TodayScreen />} />
      <Route path="/log" element={<LogFoodScreen />} />
      <Route path="/confirm" element={<ConfirmMealScreen />} />
      <Route path="/history" element={<HistoryScreen />} />
      <Route path="/history/:id" element={<MealDetailScreen />} />
      <Route path="/trends" element={<TrendsScreen />} />
      <Route path="/trends/:key" element={<NutrientDetailScreen />} />
      <Route path="/foods" element={<FoodsScreen />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
