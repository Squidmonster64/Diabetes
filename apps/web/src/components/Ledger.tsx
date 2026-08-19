export interface LedgerItem {
  calculationId: string;
  createdAt: string;
  state: string;
  roundedTotalUnits?: string;
  carbohydrateGrams?: string;
  glucose?: string;
  refusalCode?: string;
}

export function Ledger({ items, onSelect }: { items: readonly LedgerItem[]; onSelect?: (item: LedgerItem) => void }) {
  if (items.length === 0) return <p className="muted">No calculation records yet.</p>;

  return (
    <div role="list" aria-label="Calculation ledger">
      {items.map((item) => {
        const body = (
          <>
            <span>
              <strong>{new Date(item.createdAt).toLocaleString()}</strong>
              <span className="muted"> · {item.state}</span>
              {item.refusalCode ? <span className="muted"> · {item.refusalCode}</span> : null}
            </span>
            <span className="trace-row__value">
              {item.roundedTotalUnits !== undefined ? `${item.roundedTotalUnits} U` : "Refused"}
            </span>
          </>
        );
        return onSelect ? (
          <button className="ledger-row" type="button" role="listitem" key={item.calculationId} onClick={() => onSelect(item)}>
            {body}
          </button>
        ) : (
          <div className="ledger-row" role="listitem" key={item.calculationId}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
