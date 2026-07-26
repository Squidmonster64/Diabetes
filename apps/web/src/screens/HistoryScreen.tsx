import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

interface HistoryEvent {
  calculationId: string;
  state: string;
  createdAt: string;
  result: { status: string; roundedTotalUnits?: string; refusalCode?: string };
}

export function HistoryScreen() {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getHistory()
      .then((response) => setEvents(response.events as HistoryEvent[]))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load history."));
  }, []);

  return (
    <Screen title="History">
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {events === null && !error ? <p className="muted">Loading…</p> : null}
      {events && events.length === 0 ? <p className="muted">No calculations recorded yet.</p> : null}
      <ul className="result-list">
        {events?.map((event) => (
          <li key={event.calculationId}>
            <Link to={`/history/${event.calculationId}`}>
              <div className="card">
                <div className="timestamp">{new Date(event.createdAt).toLocaleString()}</div>
                <div>
                  {event.result.status === "REFUSED"
                    ? `Refused: ${event.result.refusalCode}`
                    : `${event.result.roundedTotalUnits} units`}
                </div>
                <span className="badge">{event.state}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
