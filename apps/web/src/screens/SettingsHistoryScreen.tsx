import { useEffect, useState } from "react";
import { api } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

interface SettingsVersion {
  id: string;
  version: number;
  status: string;
  createdAt: string;
  icr: string;
  isf: string;
  glucoseUnit: string;
}

export function SettingsHistoryScreen() {
  const [history, setHistory] = useState<SettingsVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettingsHistory()
      .then((response) => setHistory(response.history as SettingsVersion[]))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load settings history."));
  }, []);

  return (
    <Screen title="Settings version history">
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {history === null && !error ? <p className="muted">Loading…</p> : null}
      {history?.map((version) => (
        <div className="card" key={version.id}>
          <div>
            Version {version.version} <span className="badge">{version.status}</span>
          </div>
          <div className="muted">
            ICR {version.icr} · ISF {version.isf} · {version.glucoseUnit}
          </div>
          <div className="timestamp">{new Date(version.createdAt).toLocaleString()}</div>
        </div>
      ))}
    </Screen>
  );
}
