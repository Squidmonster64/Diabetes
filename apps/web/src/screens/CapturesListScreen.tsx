import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Screen } from "../components/Screen.js";
import { api, type CaptureRecord } from "../lib/apiClient.js";
import { intentCopy } from "@diabetes-companion/natural-language";

export function CapturesListScreen() {
  const [captures, setCaptures] = useState<CaptureRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .listCaptures()
      .then((response) => setCaptures(response.captures))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load captures."));
  }, []);

  return (
    <Screen title="Captures">
      <p className="muted">Original spoken or typed words are kept here. Interpretations can be reviewed later; they never overwrite the source.</p>
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {captures === null && !error ? <p className="muted">Loading…</p> : null}
      {captures?.length === 0 ? <p className="muted">No captures yet. Describe glucose, insulin, or food to create one.</p> : null}
      {captures?.map((capture) => {
        const copy = intentCopy(capture.intent);
        return (
          <button
            key={capture.id}
            className="result-item"
            type="button"
            onClick={() => navigate(`/captures/${capture.id}`)}
          >
            <strong>{capture.captureCode}</strong>
            <div>{capture.originalText.slice(0, 140)}{capture.originalText.length > 140 ? "…" : ""}</div>
            <div className="muted">{copy.title} · {capture.interpretationStatus.toLowerCase().replaceAll("_", " ")}</div>
          </button>
        );
      })}
    </Screen>
  );
}
