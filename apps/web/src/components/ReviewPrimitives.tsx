import type { ReactNode } from "react";

export function SpanHighlighter({
  text,
  spans,
  selectedIndex,
}: {
  text: string;
  spans: readonly { start: number; end: number }[];
  selectedIndex?: number | null;
}) {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  let cursor = 0;
  const nodes: ReactNode[] = [];

  ordered.forEach((span, index) => {
    const start = Math.max(cursor, span.start);
    const end = Math.max(start, Math.min(text.length, span.end));
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <mark className={selectedIndex === index ? "raw-span extracted-row--selected" : "raw-span"} key={`${start}-${end}-${index}`}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return <p>{nodes}</p>;
}

export function ExtractedRow({
  label,
  value,
  detail,
  selected = false,
  onSelect,
}: {
  label: string;
  value: string;
  detail?: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <span>
        <strong>{label}</strong>
        {detail ? <span className="muted"> · {detail}</span> : null}
      </span>
      <span className="trace-row__value">{value}</span>
    </>
  );
  return onSelect ? (
    <button className={`extracted-row ${selected ? "extracted-row--selected" : ""}`} type="button" onClick={onSelect}>
      {content}
    </button>
  ) : (
    <div className={`extracted-row ${selected ? "extracted-row--selected" : ""}`}>{content}</div>
  );
}

export function ClarificationPrompt({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <section className="clarification-prompt" aria-label="Clarification required">
      <strong>{question}</strong>
      <div className="clarification-prompt__choices">{children}</div>
    </section>
  );
}

export function NumberPad({
  value,
  onChange,
  unit,
}: {
  value: string;
  onChange: (next: string) => void;
  unit: string;
}) {
  const append = (token: string) => {
    if (token === "clear") return onChange("");
    if (token === "backspace") return onChange(value.slice(0, -1));
    if (token === "." && value.includes(".")) return;
    onChange(`${value}${token}`);
  };

  return (
    <div aria-label={`Numeric entry in ${unit}`}>
      <div className="card" aria-live="polite">
        <span className="dose-display" style={{ fontSize: "2rem" }}>{value || "0"}</span>
        <span className="dose-unit">{unit}</span>
      </div>
      <div className="clarification-prompt__choices">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace", "clear"].map((token) => (
          <button className="btn-secondary" type="button" key={token} onClick={() => append(token)}>
            {token === "backspace" ? "⌫" : token === "clear" ? "Clear" : token}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LifecycleBanner({
  status,
  children,
}: {
  status: "EXPIRED" | "USER_CONFIRMED" | "ADMINISTRATION_RECORDED" | "INVALIDATED" | "DUPLICATE_CONFIRMATION";
  children: ReactNode;
}) {
  const tone = status === "USER_CONFIRMED" || status === "ADMINISTRATION_RECORDED" ? "settled" : status === "EXPIRED" || status === "INVALIDATED" ? "halt" : "";
  return <div className={`lifecycle-banner ${tone ? `lifecycle-banner--${tone}` : ""}`}>{children}</div>;
}
