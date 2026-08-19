import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ledger, type LedgerItem } from "../components/Ledger.js";
import { Screen } from "../components/Screen.js";
import { api } from "../lib/apiClient.js";

interface HistoryEvent extends LedgerItem {
  result: { status: string; roundedTotalUnits?: string; refusalCode?: string };
}

function csvCell(value: string | undefined): string {
  const text = value ?? "";
  return `"${text.replaceAll('"', '""')}"`;
}

function exportLedger(events: readonly HistoryEvent[]) {
  const rows = [
    ["calculation_id", "timestamp", "status", "dose_units", "refusal_code"],
    ...events.map((event) => [event.calculationId, event.createdAt, event.state, event.result.roundedTotalUnits ?? "", event.result.refusalCode ?? ""]),
  ];
  const blob = new Blob([rows.map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `diabetes-companion-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function HistoryScreen() {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .getHistory()
      .then((response) => setEvents(response.events as HistoryEvent[]))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the ledger."));
  }, []);

  return (
    <Screen title="Ledger">
      <p className="muted">Calculation and refusal records for this clinician-supervised test session.</p>
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {events === null && !error ? <p className="muted">Loading…</p> : null}
      {events ? (
        <>
          <button className="btn-secondary" type="button" disabled={events.length === 0} onClick={() => exportLedger(events)}>
            Export clinician CSV
          </button>
          <div style={{ height: "1rem" }} />
          <Ledger
            items={events.map((event) => ({
              calculationId: event.calculationId,
              createdAt: event.createdAt,
              state: event.state,
              roundedTotalUnits: event.result.roundedTotalUnits,
              refusalCode: event.result.refusalCode,
            }))}
            onSelect={(event) => navigate(`/history/${event.calculationId}`)}
          />
        </>
      ) : null}
    </Screen>
  );
}
