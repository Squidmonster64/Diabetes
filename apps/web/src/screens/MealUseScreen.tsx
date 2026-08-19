import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { MealCarbohydrateCalculationResult, SavedMealRecord } from "@diabetes-companion/food-contracts";
import { api } from "../lib/apiClient.js";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

type QuantityDraft = { readonly kind: "GRAMS" | "MILLILITRES" | "MEASURE"; readonly value: string };

function initialQuantityDraft(component: SavedMealRecord["components"][number]): QuantityDraft {
  if (component.quantityKind === "MILLILITRES") return { kind: "MILLILITRES", value: component.quantityMillilitres ?? "" };
  if (component.quantityKind === "MEASURE") return { kind: "MEASURE", value: component.measureMultiplier ?? "" };
  return { kind: "GRAMS", value: component.quantityGrams ?? "" };
}

function quantityLabel(draft: QuantityDraft): string {
  if (draft.kind === "MILLILITRES") return "Quantity (mL)";
  if (draft.kind === "MEASURE") return "Number of this saved measure";
  return "Quantity (g)";
}

export function MealUseScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setCarbResult } = useWorkflow();
  const [meal, setMeal] = useState<SavedMealRecord | null>(null);
  const [calculation, setCalculation] = useState<MealCarbohydrateCalculationResult | null>(null);
  const [quantityOverrides, setQuantityOverrides] = useState<Record<string, QuantityDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getMeal(id).then(({ meal: loaded, calculation: initialCalculation }) => {
      setMeal(loaded);
      setCalculation(initialCalculation);
      setQuantityOverrides(Object.fromEntries(loaded.components.map((component) => [component.id, initialQuantityDraft(component)])));
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not load recipe."));
  }, [id]);

  const recalculate = async () => {
    if (!id || !meal) return;
    setError(null);
    setRecalculating(true);
    try {
      const overrides = meal.components.map((component) => {
        const draft = quantityOverrides[component.id] ?? initialQuantityDraft(component);
        const value = Number(draft.value);
        return {
          componentId: component.id,
          quantityKind: draft.kind,
          quantityGrams: draft.kind === "GRAMS" ? value : undefined,
          quantityMillilitres: draft.kind === "MILLILITRES" ? value : undefined,
          measureId: draft.kind === "MEASURE" ? component.measureId : undefined,
          measureMultiplier: draft.kind === "MEASURE" ? value : undefined,
        };
      });
      const result = await api.calculateMealCarbohydrate(id, overrides);
      setCalculation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recalculate this recipe.");
    } finally {
      setRecalculating(false);
    }
  };

  const useThisTotal = () => {
    if (!calculation || !meal) return;
    setCarbResult({
      sourceDataset: "AUSNUT_2023",
      sourceFoodId: meal.id,
      foodName: meal.name,
      brand: null,
      portionDescription: `${meal.name} (${calculation.components.length} ingredients)`,
      portionQuantity: 1,
      portionGrams: null,
      portionMillilitres: null,
      carbohydrateGrams: calculation.totalCarbohydrateGrams,
      carbohydrateDefinition: "available_carbohydrate_without_sugar_alcohols",
      provenance: {
        database: "australian_foods.sqlite",
        sourceObject: "saved_recipe_components",
        databaseSha256: "",
      },
    });
    navigate("/glucose-entry");
  };

  if (!meal || !calculation) {
    return <Screen title="Review recipe"><p className="muted">{error ?? "Loading…"}</p></Screen>;
  }

  return (
    <Screen title={meal.name}>
      {error ? <div className="banner banner-danger">{error}</div> : null}
      <p className="muted">Review this recipe before using its carbohydrate total. Changes here apply only this time; use Edit recipe to change the saved ingredients.</p>
      {calculation.components.map((component) => {
        const draft = quantityOverrides[component.componentId] ?? { kind: "GRAMS" as const, value: "" };
        return (
          <div className="card" key={component.componentId}>
            <div>{component.label}</div>
            <div className="field" style={{ marginBottom: "0.25rem" }}>
              <label htmlFor={`use-quantity-${component.componentId}`}>{quantityLabel(draft)}</label>
              <input
                id={`use-quantity-${component.componentId}`}
                type="number"
                inputMode="decimal"
                min="0"
                value={draft.value}
                onChange={(event) => setQuantityOverrides((current) => ({ ...current, [component.componentId]: { ...draft, value: event.target.value } }))}
              />
            </div>
            <div className="muted">{component.portionDescription} · {component.carbohydrateGrams} g carbohydrate</div>
          </div>
        );
      })}
      <button className="btn-secondary" type="button" onClick={() => void recalculate()} disabled={recalculating}>
        {recalculating ? "Recalculating…" : "Recalculate this review"}
      </button>

      <div className="dose-display">{calculation.totalCarbohydrateGrams} g</div>
      <div className="dose-unit">reviewed carbohydrate total for this recipe</div>

      <button className="btn-primary" type="button" onClick={useThisTotal}>
        Use this reviewed total
      </button>
      <Link to={`/meals/${meal.id}/edit`}><button className="btn-secondary" type="button">Edit recipe</button></Link>
    </Screen>
  );
}
