import { useEffect, useState } from "react";
import { api } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

export function DataProvenanceScreen() {
  const [health, setHealth] = useState<{ databaseSha256: string; calculatorVersion: string } | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <Screen title="Data provenance">
      <div className="card">
        <div className="muted">Food database</div>
        <div>australian_foods.sqlite</div>
        <div className="muted">Sources: AUSNUT 2023, AFCD Release 3</div>
      </div>
      {health ? (
        <div className="card">
          <div className="muted">Database SHA-256</div>
          <div style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.8rem" }}>
            {health.databaseSha256}
          </div>
        </div>
      ) : null}
      <div className="card">
        <div className="muted">Calculator version</div>
        <div>{health?.calculatorVersion ?? "unknown"}</div>
      </div>
      <p className="muted">
        Carbohydrate values use "available carbohydrate without sugar alcohols" where present, falling back to
        "available carbohydrate with sugar alcohols" only when the former is not recorded for a given food.
      </p>
    </Screen>
  );
}
