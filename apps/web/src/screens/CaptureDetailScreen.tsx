import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { intentCopy } from "@diabetes-companion/natural-language";
import { Screen } from "../components/Screen.js";
import { api, type CaptureActionRecord, type CaptureRecord } from "../lib/apiClient.js";

export function CaptureDetailScreen() {
  const { captureId } = useParams();
  const navigate = useNavigate();
  const [capture, setCapture] = useState<(CaptureRecord & { actions?: CaptureActionRecord[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!captureId) return;
    api
      .getCapture(captureId)
      .then((response) => setCapture(response))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this capture."));
  }, [captureId]);

  if (error) return <Screen title="Capture"><div className="banner banner-danger">{error}</div></Screen>;
  if (!capture) return <Screen title="Capture"><p className="muted">Loading…</p></Screen>;

  const copy = intentCopy(capture.intent);
  const calculationAction = capture.actions?.find((action) => action.calculationId);
  return (
    <Screen title={capture.captureCode}>
      <section className="card">
        <p className="field-label">Original words</p>
        <p>{capture.originalText}</p>
        <p className="muted">
          {capture.sourceType === "voice" ? "Captured from in-app voice" : "Typed"} · {new Date(capture.createdAt).toLocaleString()}
        </p>
      </section>
      <section className="card">
        <p className="field-label">{copy.title}</p>
        <p>{copy.body}</p>
        <p className="muted">Status: {capture.interpretationStatus.toLowerCase().replaceAll("_", " ")}</p>
      </section>
      <section className="card">
        <p className="field-label">Normalised draft</p>
        <p className="muted">{capture.normalisedText}</p>
      </section>
      {capture.actions && capture.actions.length > 0 ? (
        <section className="card">
          <p className="field-label">Provenance</p>
          {capture.actions.map((action) => (
            <p key={action.id} className="muted">
              {action.actionType.toLowerCase().replaceAll("_", " ")}
              {action.calculationId ? ` · calculation ${action.calculationId.slice(0, 8)}` : ""}
              {" · "}
              {new Date(action.createdAt).toLocaleString()}
            </p>
          ))}
        </section>
      ) : null}
      {calculationAction?.calculationId ? (
        <button className="btn-primary" type="button" onClick={() => navigate(`/history/${calculationAction.calculationId}`)}>
          View linked calculation
        </button>
      ) : null}
    </Screen>
  );
}
