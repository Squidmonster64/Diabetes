import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

export function HistoryEventDetailsScreen() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    api
      .getHistoryEvent(eventId)
      .then((response) => setEvent(response as Record<string, unknown>))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load event."));
  }, [eventId]);

  if (error) {
    return (
      <Screen title="Event details">
        <div className="banner banner-danger">{error}</div>
      </Screen>
    );
  }
  if (!event) {
    return (
      <Screen title="Event details">
        <p className="muted">Loading…</p>
      </Screen>
    );
  }

  return (
    <Screen title="Event details">
      <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", color: "var(--text-muted)" }}>
        {JSON.stringify(event, null, 2)}
      </pre>
    </Screen>
  );
}
