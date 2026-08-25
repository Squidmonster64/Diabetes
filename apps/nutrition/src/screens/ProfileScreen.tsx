import { useEffect, useState } from "react";
import { Shell } from "../components/Shell.js";
import { api, userTimezone } from "../lib/api.js";
import { useAuth } from "../state/AuthContext.js";
import type { NutritionTargets } from "@diabetes-companion/food-engine";

export function ProfileScreen() {
  const { signOut } = useAuth();
  const [energy, setEnergy] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fibre, setFibre] = useState("");
  const [sodium, setSodium] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api.getTargets().then(({ targets }) => {
      setEnergy(String(targets?.energyKcal?.value ?? ""));
      setProtein(String(targets?.proteinG?.value ?? ""));
      setCarbs(String(targets?.carbohydrateG?.value ?? ""));
      setFat(String(targets?.fatG?.value ?? ""));
      setFibre(String(targets?.fibreG?.value ?? ""));
      setSodium(String(targets?.sodiumMg?.value ?? ""));
    });
  }, []);

  const save = async () => {
    const targets: NutritionTargets = {
      energyKcal: energy ? { kind: "target", value: Number(energy) } : null,
      proteinG: protein ? { kind: "minimum", value: Number(protein) } : null,
      carbohydrateG: carbs ? { kind: "target", value: Number(carbs) } : null,
      fatG: fat ? { kind: "target", value: Number(fat) } : null,
      fibreG: fibre ? { kind: "minimum", value: Number(fibre) } : null,
      sodiumMg: sodium ? { kind: "limit", value: Number(sodium) } : null,
    };
    await api.putTargets(targets);
    await api.putProfile({ timezone: userTimezone(), onboardingComplete: true, targetsSkipped: false });
    setMessage("Targets saved. These are your configured numbers, not a diagnosis.");
  };

  const download = async (format: "csv" | "json") => {
    const body = format === "csv" ? await api.exportCsv() : JSON.stringify(await api.exportJson(), null, 2);
    const blob = new Blob([typeof body === "string" ? body : JSON.stringify(body)], { type: format === "csv" ? "text/csv" : "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = format === "csv" ? "nutrition-export.csv" : "nutrition-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
    void api.track("export_used");
  };

  return (
    <Shell title="Profile">
      <p className="muted">Metric units (g, mL). Timezone: {userTimezone()}.</p>
      {message ? <div className="banner banner-success">{message}</div> : null}
      <div className="field"><label>Energy kcal</label><input value={energy} onChange={(e) => setEnergy(e.target.value)} inputMode="numeric" /></div>
      <div className="field"><label>Protein minimum g</label><input value={protein} onChange={(e) => setProtein(e.target.value)} inputMode="numeric" /></div>
      <div className="field"><label>Carbs g</label><input value={carbs} onChange={(e) => setCarbs(e.target.value)} inputMode="numeric" /></div>
      <div className="field"><label>Fat g</label><input value={fat} onChange={(e) => setFat(e.target.value)} inputMode="numeric" /></div>
      <div className="field"><label>Fibre minimum g</label><input value={fibre} onChange={(e) => setFibre(e.target.value)} inputMode="numeric" /></div>
      <div className="field"><label>Sodium limit mg</label><input value={sodium} onChange={(e) => setSodium(e.target.value)} inputMode="numeric" /></div>
      <button className="btn-primary" type="button" onClick={() => void save()}>Save targets</button>
      <div style={{ height: 12 }} />
      <button className="btn-secondary" type="button" onClick={() => void download("csv")}>Export CSV</button>
      <div style={{ height: 8 }} />
      <button className="btn-secondary" type="button" onClick={() => void download("json")}>Export JSON backup</button>
      <div style={{ height: 8 }} />
      <button className="btn-secondary" type="button" onClick={() => void signOut()}>Sign out</button>
      <div style={{ height: 8 }} />
      <button className="btn-danger" type="button" onClick={() => {
        if (window.confirm("Delete all of your nutrition logs, targets and saved foods on this service?")) {
          void api.deleteAccountData().then(() => setMessage("Nutrition data deleted."));
        }
      }}>Delete my nutrition data</button>
    </Shell>
  );
}
