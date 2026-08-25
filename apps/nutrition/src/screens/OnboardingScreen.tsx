import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, userTimezone } from "../lib/api.js";
import type { NutritionTargets } from "@diabetes-companion/food-engine";

export function OnboardingScreen() {
  const navigate = useNavigate();
  const [energy, setEnergy] = useState("2200");
  const [protein, setProtein] = useState("150");
  const [carbs, setCarbs] = useState("250");
  const [fat, setFat] = useState("70");
  const [fibre, setFibre] = useState("30");
  const [sodium, setSodium] = useState("2000");
  const [error, setError] = useState<string | null>(null);

  const finish = async (targets: NutritionTargets | null, skipped: boolean) => {
    try {
      await api.putProfile({ timezone: userTimezone(), onboardingComplete: true, targetsSkipped: skipped });
      await api.putTargets(targets);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  };

  return (
    <div className="app-shell">
      <main className="screen">
        <h1>Set targets</h1>
        <p className="muted">Optional. These are your numbers, not a medical prescription. You can skip and add them later.</p>
        {error ? <div className="banner banner-danger">{error}</div> : null}
        <div className="field"><label htmlFor="energy">Energy (kcal)</label><input id="energy" inputMode="numeric" value={energy} onChange={(e) => setEnergy(e.target.value)} /></div>
        <div className="field"><label htmlFor="protein">Protein minimum (g)</label><input id="protein" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} /></div>
        <div className="field"><label htmlFor="carbs">Carbohydrate (g)</label><input id="carbs" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></div>
        <div className="field"><label htmlFor="fat">Fat (g)</label><input id="fat" inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} /></div>
        <div className="field"><label htmlFor="fibre">Fibre minimum (g)</label><input id="fibre" inputMode="numeric" value={fibre} onChange={(e) => setFibre(e.target.value)} /></div>
        <div className="field"><label htmlFor="sodium">Sodium limit (mg)</label><input id="sodium" inputMode="numeric" value={sodium} onChange={(e) => setSodium(e.target.value)} /></div>
        <button
          className="btn-primary"
          type="button"
          onClick={() =>
            void finish(
              {
                energyKcal: { kind: "target", value: Number(energy) || null },
                proteinG: { kind: "minimum", value: Number(protein) || null },
                carbohydrateG: { kind: "target", value: Number(carbs) || null },
                fatG: { kind: "target", value: Number(fat) || null },
                fibreG: { kind: "minimum", value: Number(fibre) || null },
                sodiumMg: { kind: "limit", value: Number(sodium) || null },
              },
              false,
            )
          }
        >
          Save targets
        </button>
        <div style={{ height: 8 }} />
        <button className="btn-secondary" type="button" onClick={() => void finish(null, true)}>
          Skip for now
        </button>
      </main>
    </div>
  );
}
