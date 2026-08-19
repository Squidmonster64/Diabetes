import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { LifecycleBanner } from "../components/ReviewPrimitives.js";
import { Screen } from "../components/Screen.js";
import { api } from "../lib/apiClient.js";

interface CalculationEvent {
  calculationId: string;
  state: string;
  createdAt: string;
  expiresAt?: string;
  confirmedAt?: string;
  administeredAt?: string;
  administeredUnits?: string;
  result: {
    status: string;
    roundedTotalUnits?: string;
    refusalCode?: string;
    userFacingMessage?: string;
    blockingReason?: string;
    safeNextStep?: string;
    calculationVersion?: string;
    safetyPolicyVersion?: string;
    settingsId?: string;
    settingsVersion?: number;
  };
}

function lifecycleCopy(state: string): string {
  switch (state) {
    case "USER_CONFIRMED": return "Calculation confirmed. Record administration separately when it occurs.";
    case "ADMINISTRATION_RECORDED": return "Administration was recorded durably in the ledger.";
    case "INVALIDATED": return "This calculation was invalidated. Return to entry with the retained inputs.";
    case "DUPLICATE_CONFIRMATION": return "A prior confirmation record already exists for this calculation.";
    case "EXPIRED": return "This preview expired before it could be confirmed.";
    default: return `Lifecycle state: ${state}`;
  }
}

export function HistoryEventDetailsScreen() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<CalculationEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    api.getHistoryEvent(eventId).then((response) => setEvent(response as CalculationEvent)).catch((err) => setError(err instanceof Error ? err.message : "Could not load event."));
  }, [eventId]);

  if (error) return <Screen title="Ledger record"><div className="banner banner-danger">{error}</div></Screen>;
  if (!event) return <Screen title="Ledger record"><p className="muted">Loading…</p></Screen>;

  const refusal = event.result.status === "REFUSED";
  return (
    <Screen title="Ledger record">
      <LifecycleBanner status={event.state as "EXPIRED" | "USER_CONFIRMED" | "ADMINISTRATION_RECORDED" | "INVALIDATED" | "DUPLICATE_CONFIRMATION"}>
        {lifecycleCopy(event.state)}
      </LifecycleBanner>
      <section className="card">
        <p className="field-label">Recorded</p>
        <p>{new Date(event.createdAt).toLocaleString()}</p>
        {refusal ? (
          <>
            <p className="field-label">Refusal</p>
            <p>{event.result.userFacingMessage}</p>
            <p className="muted">{event.result.blockingReason}</p>
            <p>{event.result.safeNextStep}</p>
            <p className="muted">Code: {event.result.refusalCode}</p>
          </>
        ) : (
          <>
            <p className="field-label">Dose</p>
            <p className="dose-display" style={{ fontSize: "2.25rem" }}>{event.result.roundedTotalUnits} U</p>
            {event.administeredAt ? <p className="muted">Administration recorded at {new Date(event.administeredAt).toLocaleString()}.</p> : null}
          </>
        )}
      </section>
      <details className="card">
        <summary className="trace-summary"><span>Audit metadata</span><span className="muted">View details</span></summary>
        <div className="trace-row"><span>Calculation version</span><span className="trace-row__value">{event.result.calculationVersion ?? "—"}</span></div>
        <div className="trace-row"><span>Safety policy</span><span className="trace-row__value">{event.result.safetyPolicyVersion ?? "—"}</span></div>
        <div className="trace-row"><span>Settings version</span><span className="trace-row__value">{event.result.settingsVersion ?? "—"}</span></div>
      </details>
    </Screen>
  );
}
