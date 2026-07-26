import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { MealCarbohydrateCalculationResult, SavedMealRecord } from "@diabetes-companion/food-contracts";
import { api } from "../lib/apiClient.js";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

export function MealUseScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setCarbResult } = useWorkflow();
  const [meal, setMeal] = useState<SavedMealRecord | null>(null);
  const [calculation, setCalculation] = useState<MealCarbohydrateCalculationResult | null>(null);
  const [quantityOverrides, setQuantityOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getMeal(id).then(({ meal: loaded, calculation: initialCalculation }) => {
      setMeal(loaded);
      setCalculation(initialCalculation);
      const drafts: Record<string, string> = {};
      for (const component of loaded.components) drafts[component.id] = component.quantityGrams ?? "";
      setQuantityOverrides(drafts);
    });
  }, [id]);

  const recalculate = async () => {
    if (!id || !meal) return;
    setError(null);
    try {
      const overrides = meal.components.map((component) => ({
        componentId: component.id,
        quantityKind: "GRAMS",
        quantityGrams: quantityOverrides[component.id],
      }));
      const result = await api.calculateMealCarbohydrate(id, overrides);
      setCalculation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recalculate this meal.");
    }
  };

  const useThisTotal = () => {
    if (!calculation || !meal) return;
    setCarbResult({
      sourceDataset: "AUSNUT_2023",
      sourceFoodId: meal.id,
      foodName: meal.name,
      brand: null,
      portionDescription: `${meal.name} (${calculation.components.length} components)`,
      portionQuantity: 1,
      portionGrams: null,
      portionMillilitres: null,
      carbohydrateGrams: calculation.totalCarbohydrateGrams,
      carbohydrateDefinition: "available_carbohydrate_without_sugar_alcohols",
      provenance: {
        database: "australian_foods.sqlite",
        sourceObject: "saved_meal_components",
        databaseSha256: "",
      },
    });
    navigate("/glucose-entry");
  };

  if (!meal || !calculation) {
    return (
      <Screen title="Use meal">
        <p className="muted">Loading…</p>
      </Screen>
    );
  }

  return (
    <Screen title={meal.name}>
      {error ? <div className="banner banner-danger">{error}</div> : null}
      <p className="muted">
        Adjust quantities for this meal if today's portions differ from usual. Changes here apply only to this use -
        they do not change your saved recipe.
      </p>
      {calculation.components.map((component) => (
        <div className="card" key={component.componentId}>
          <div>{component.label}</div>
          <div className="field" style={{ marginBottom: "0.25rem" }}>
            <label>Quantity (g)</label>
            <input
              type="number"
              inputMode="decimal"
              value={quantityOverrides[component.componentId] ?? ""}
              onChange={(e) =>
                setQuantityOverrides((prev) => ({ ...prev, [component.componentId]: e.target.value }))
              }
            />
          </div>
          <div className="muted">{component.carbohydrateGrams} g carbohydrate</div>
        </div>
      ))}
      <button className="btn-secondary" onClick={recalculate}>
        Recalculate
      </button>

      <div className="dose-display">{calculation.totalCarbohydrateGrams} g</div>
      <div className="dose-unit">total carbohydrate for this meal</div>

      <button className="btn-primary" onClick={useThisTotal}>
        Use this total
      </button>
    </Screen>
  );
}
