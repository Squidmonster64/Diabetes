export function RefusalCard({
  blockingReason,
  safeNextStep,
  refusalCategory,
  refusalCode,
}: {
  blockingReason: string;
  safeNextStep: string;
  refusalCategory: string;
  refusalCode: string;
}) {
  return (
    <section className="card" aria-label="Why this calculation is unavailable">
      <p className="field-label">Why this is blocked</p>
      <p>{blockingReason}</p>
      <p className="field-label">Next step</p>
      <p>{safeNextStep}</p>
      <details>
        <summary className="muted">Technical details</summary>
        <div className="trace-row">
          <span>Category</span>
          <span className="trace-row__value">{refusalCategory}</span>
        </div>
        <div className="trace-row">
          <span>Refusal code</span>
          <span className="trace-row__value">{refusalCode}</span>
        </div>
      </details>
    </section>
  );
}
