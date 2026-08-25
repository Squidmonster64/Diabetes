import { CORE_DISPLAY_NUTRIENTS, NUTRIENT_META, formatNutrient, type NutrientKey, type NutrientPanel, type NutritionTargets } from "@diabetes-companion/food-engine";

function targetFor(targets: NutritionTargets | null, key: NutrientKey) {
  if (!targets) return null;
  if (key === "energyKcal") return targets.energyKcal;
  if (key === "proteinG") return targets.proteinG;
  if (key === "carbohydrateG") return targets.carbohydrateG;
  if (key === "fatG") return targets.fatG;
  if (key === "fibreG") return targets.fibreG;
  if (key === "sodiumMg") return targets.sodiumMg;
  return null;
}

export function MacroGrid({ totals, targets }: { totals: NutrientPanel; targets: NutritionTargets | null }) {
  return (
    <div className="macro-grid">
      {CORE_DISPLAY_NUTRIENTS.map((key) => {
        const meta = NUTRIENT_META.find((item) => item.key === key)!;
        const value = totals[key];
        const target = targetFor(targets, key);
        const configured = target?.value ?? target?.max ?? null;
        const ratio = value !== null && configured ? Math.min(value / configured, 1.4) : 0;
        const over = Boolean(configured && value !== null && target?.kind === "limit" && value > configured);
        return (
          <div className="macro" key={key}>
            <div className="macro__label">{meta.label}</div>
            <div className="macro__value">
              {formatNutrient(value, meta.unit)}
              {configured != null ? <span className="muted"> / {configured}</span> : null}
            </div>
            {configured != null ? (
              <div className={`progress${over ? " progress--over" : target?.kind === "limit" ? " progress--limit" : ""}`} aria-hidden="true">
                <span style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
