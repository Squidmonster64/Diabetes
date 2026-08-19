import type { ReactNode } from "react";

export function CalculationTrace({
  explanation,
  mealComponentUnits,
  correctionComponentUnits,
  activeInsulinAdjustmentUnits,
  unroundedTotalUnits,
}: {
  explanation: readonly string[];
  mealComponentUnits?: string;
  correctionComponentUnits?: string;
  activeInsulinAdjustmentUnits?: string;
  unroundedTotalUnits?: string;
}) {
  const detailRows: Array<[string, string]> = [];
  if (mealComponentUnits !== undefined) detailRows.push(["Meal component", `${mealComponentUnits} U`]);
  if (correctionComponentUnits !== undefined) detailRows.push(["Correction component", `${correctionComponentUnits} U`]);
  if (activeInsulinAdjustmentUnits !== undefined) detailRows.push(["Active insulin adjustment", `${activeInsulinAdjustmentUnits} U`]);
  if (unroundedTotalUnits !== undefined) detailRows.push(["Unrounded total", `${unroundedTotalUnits} U`]);

  const body: ReactNode = (
    <>
      {detailRows.map(([label, value]) => (
        <div className="trace-row" key={label}>
          <span>{label}</span>
          <span className="trace-row__value">{value}</span>
        </div>
      ))}
      <ul className="explanation-list" aria-label="Calculation explanation">
        {explanation.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
    </>
  );

  return (
    <details className="card">
      <summary className="trace-summary">
        <span>Calculation trace</span>
        <span className="muted">View details</span>
      </summary>
      <div>{body}</div>
    </details>
  );
}
