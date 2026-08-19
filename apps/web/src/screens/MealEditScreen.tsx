import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  CustomFoodRecord,
  FoodMeasure,
  FoodSearchResult,
  OnlineFoodLookupCandidate,
  SavedMealComponentRecord,
  SavedMealRecord,
} from "@diabetes-companion/food-contracts";
import { api, ApiError } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

type RecipeFoodChoice =
  | { readonly kind: "CUSTOM"; readonly food: CustomFoodRecord }
  | { readonly kind: "OFFICIAL"; readonly food: FoodSearchResult }
  | { readonly kind: "ONLINE"; candidate: OnlineFoodLookupCandidate };

type IngredientQuantityKind = "GRAMS" | "MILLILITRES" | "MEASURE" | "SAVED_SERVING";

function componentQuantity(component: SavedMealComponentRecord): string {
  if (component.quantityKind === "MILLILITRES") return component.quantityMillilitres ?? "";
  if (component.quantityKind === "MEASURE") return component.measureMultiplier ?? "";
  return component.quantityGrams ?? "";
}

function componentUnitLabel(component: SavedMealComponentRecord): string {
  if (component.quantityKind === "MILLILITRES") return "mL";
  if (component.quantityKind === "MEASURE") return "recipe measure";
  return "g";
}

function choiceLabel(choice: RecipeFoodChoice): string {
  if (choice.kind === "CUSTOM") return choice.food.name;
  if (choice.kind === "ONLINE") return choice.candidate.name;
  return choice.food.foodName;
}

export function MealEditScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meal, setMeal] = useState<SavedMealRecord | null>(null);
  const [name, setName] = useState("");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [customFoods, setCustomFoods] = useState<CustomFoodRecord[]>([]);
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [officialResults, setOfficialResults] = useState<FoodSearchResult[]>([]);
  const [onlineLookup, setOnlineLookup] = useState<{ status: "idle" | "loading" | "ready" | "unavailable"; candidates: readonly OnlineFoodLookupCandidate[] }>({ status: "idle", candidates: [] });
  const [selectedFood, setSelectedFood] = useState<RecipeFoodChoice | null>(null);
  const [quantityKind, setQuantityKind] = useState<IngredientQuantityKind>("GRAMS");
  const [quantity, setQuantity] = useState("");
  const [measures, setMeasures] = useState<FoodMeasure[]>([]);
  const [selectedMeasureId, setSelectedMeasureId] = useState("");
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!id) return;
    api.getMeal(id).then(({ meal: loaded }) => {
      setMeal(loaded);
      setName(loaded.name);
      setQuantityDrafts(Object.fromEntries(loaded.components.map((component) => [component.id, componentQuantity(component)])));
    });
    api.listCustomFoods().then((response) => setCustomFoods(response.foods));
  };

  useEffect(load, [id]);

  const matchingCustomFoods = useMemo(() => {
    const query = ingredientQuery.trim().toLocaleLowerCase();
    if (!query) return [];
    return customFoods.filter((food) => food.name.toLocaleLowerCase().includes(query)).slice(0, 5);
  }, [customFoods, ingredientQuery]);

  const saveName = async () => {
    if (!id || !meal || name.trim() === meal.name) return;
    try {
      await api.renameMeal(id, name.trim());
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not rename recipe.");
    }
  };

  const saveQuantity = async (component: SavedMealComponentRecord) => {
    if (!id) return;
    const value = Number(quantityDrafts[component.id]);
    if (!Number.isFinite(value) || value <= 0) return;
    setError(null);
    try {
      await api.updateMealComponent(id, component.id, {
        quantityKind: component.quantityKind,
        quantityGrams: component.quantityKind === "GRAMS" ? value : undefined,
        quantityMillilitres: component.quantityKind === "MILLILITRES" ? value : undefined,
        measureId: component.quantityKind === "MEASURE" ? component.measureId : undefined,
        measureMultiplier: component.quantityKind === "MEASURE" ? value : undefined,
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update ingredient quantity.");
    }
  };

  const removeComponent = async (componentId: string) => {
    if (!id) return;
    try {
      await api.removeMealComponent(id, componentId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove ingredient.");
    }
  };

  const selectIngredient = async (choice: RecipeFoodChoice) => {
    setSelectedFood(choice);
    setQuantity("");
    setMeasures([]);
    setSelectedMeasureId("");
    setError(null);

    if (choice.kind === "CUSTOM") {
      setQuantityKind(choice.food.servingGrams ? "SAVED_SERVING" : "GRAMS");
      return;
    }
    if (choice.kind === "ONLINE") {
      setQuantityKind(choice.candidate.servingGrams !== null ? "SAVED_SERVING" : "GRAMS");
      return;
    }

    setQuantityKind("GRAMS");
    if (choice.food.sourceDataset === "AUSNUT_2023") {
      try {
        const response = await api.getMeasures(choice.food.sourceDataset, choice.food.sourceFoodId);
        setMeasures(
          response.measures.filter(
            (measure) => !/density/i.test(measure.measureDescription) && (measure.gramAmount !== null || measure.volumeMillilitres !== null),
          ),
        );
      } catch {
        setMeasures([]);
      }
    }
  };

  const searchKnownFoods = async () => {
    const query = ingredientQuery.trim();
    if (!query) return;
    setSearching(true);
    setError(null);
    setOfficialResults([]);
    setOnlineLookup({ status: "idle", candidates: [] });
    try {
      const response = await api.searchFoods(query);
      const official = response.results.slice(0, 8);
      setOfficialResults(official);
      const normalizedQuery = query.toLocaleLowerCase();
      const hasSavedFoodMatch = customFoods.some((food) => food.name.toLocaleLowerCase().includes(normalizedQuery));
      if (official.length > 0 || hasSavedFoodMatch) return;

      setOnlineLookup({ status: "loading", candidates: [] });
      try {
        const online = await api.lookupFoodOnline(query);
        setOnlineLookup({
          status: online.unavailable || online.candidates.length === 0 ? "unavailable" : "ready",
          candidates: online.candidates,
        });
      } catch {
        setOnlineLookup({ status: "unavailable", candidates: [] });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not search known foods.");
    } finally {
      setSearching(false);
    }
  };

  const addIngredient = async () => {
    if (!id || !selectedFood) return;
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setAdding(true);
    setError(null);
    try {
      if (selectedFood.kind === "ONLINE") {
        const candidate = selectedFood.candidate;
        const servingGrams = Number(candidate.servingGrams);
        const grams = quantityKind === "SAVED_SERVING" ? amount * servingGrams : amount;
        if (!Number.isFinite(grams) || grams <= 0) {
          throw new Error("This online result needs a serving weight before it can be added by serving. Choose grams instead.");
        }
        const saved = await api.createCustomFood({
          foodType: "ONLINE_CONFIRMED",
          name: candidate.name,
          brand: candidate.brand,
          servingDescription: candidate.servingDescription,
          servingGrams: candidate.servingGrams,
          carbohydratePerServingGrams: candidate.carbohydratePerServingGrams,
          carbohydratePer100gGrams: candidate.carbohydratePer100gGrams,
          sourceName: "Open Food Facts (community-contributed)",
          sourceReference: candidate.sourceUrl,
          sourceRetrievedAt: candidate.sourceRetrievedAt,
        });
        const label = quantityKind === "SAVED_SERVING"
          ? `${candidate.name} (${amount} × ${candidate.servingDescription ?? "serving"})`
          : candidate.name;
        await api.addMealComponent(id, {
          componentSource: "CUSTOM",
          customFoodId: saved.id,
          label,
          quantityKind: "GRAMS",
          quantityGrams: grams,
        });
      } else if (selectedFood.kind === "CUSTOM") {
        const servingGrams = Number(selectedFood.food.servingGrams);
        const grams = quantityKind === "SAVED_SERVING" ? amount * servingGrams : amount;
        if (!Number.isFinite(grams) || grams <= 0) {
          throw new Error("This saved food needs a serving weight before it can be added by serving. Choose grams instead.");
        }
        const label = quantityKind === "SAVED_SERVING"
          ? `${selectedFood.food.name} (${amount} × ${selectedFood.food.servingDescription ?? "serving"})`
          : selectedFood.food.name;
        await api.addMealComponent(id, {
          componentSource: "CUSTOM",
          customFoodId: selectedFood.food.id,
          label,
          quantityKind: "GRAMS",
          quantityGrams: grams,
        });
      } else {
        const food = selectedFood.food;
        if (quantityKind === "MEASURE") {
          const measure = measures.find((item) => item.measureId === selectedMeasureId);
          if (!measure) throw new Error("Choose a database measure first.");
          await api.addMealComponent(id, {
            componentSource: "AUSNUT",
            sourceDataset: food.sourceDataset,
            sourceFoodId: food.sourceFoodId,
            label: `${food.foodName} (${amount} × ${measure.measureDescription})`,
            quantityKind: "MEASURE",
            measureId: measure.measureId,
            measureMultiplier: amount,
          });
        } else if (quantityKind === "MILLILITRES") {
          await api.addMealComponent(id, {
            componentSource: "AFCD",
            sourceDataset: food.sourceDataset,
            sourceFoodId: food.sourceFoodId,
            label: food.foodName,
            quantityKind: "MILLILITRES",
            quantityMillilitres: amount,
          });
        } else {
          await api.addMealComponent(id, {
            componentSource: food.sourceDataset === "AUSNUT_2023" ? "AUSNUT" : "AFCD",
            sourceDataset: food.sourceDataset,
            sourceFoodId: food.sourceFoodId,
            label: food.foodName,
            quantityKind: "GRAMS",
            quantityGrams: amount,
          });
        }
      }
      setSelectedFood(null);
      setQuantity("");
      setSelectedMeasureId("");
      setMeasures([]);
      setIngredientQuery("");
      setOfficialResults([]);
      setOnlineLookup({ status: "idle", candidates: [] });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not add ingredient.");
    } finally {
      setAdding(false);
    }
  };

  if (!meal) {
    return <Screen title="Edit recipe"><p className="muted">Loading…</p></Screen>;
  }

  const officialCanUseMillilitres = selectedFood?.kind === "OFFICIAL" && selectedFood.food.sourceDataset === "AFCD_RELEASE_3" && selectedFood.food.hasMillilitreData;
  const officialCanUseMeasures = selectedFood?.kind === "OFFICIAL" && selectedFood.food.sourceDataset === "AUSNUT_2023" && measures.length > 0;
  const selectedCustomHasServing = selectedFood?.kind === "CUSTOM" && Boolean(selectedFood.food.servingGrams);
  const selectedOnlineHasServing = selectedFood?.kind === "ONLINE" && selectedFood.candidate.servingGrams !== null;
  const commonMeasures = measures.filter((measure) => /\b(serving|scoop|cup|tablespoon|tbsp|teaspoon|tsp|slice|piece|each|medium|small|large|unit)\b/i.test(measure.measureDescription));
  const additionalMeasures = measures.filter((measure) => !commonMeasures.some((common) => common.measureId === measure.measureId));
  const chooseQuantityKind = (kind: IngredientQuantityKind, measureId = "") => {
    setQuantityKind(kind);
    setSelectedMeasureId(measureId);
    if ((kind === "SAVED_SERVING" || kind === "MEASURE") && !quantity) setQuantity("1");
  };

  return (
    <Screen title="Edit recipe">
      <p className="muted">Build this recipe from your saved foods and the Australian food database. Its current ingredient values are always shown for review before use.</p>
      <div className="field">
        <label htmlFor="mealName">Recipe name</label>
        <input id="mealName" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void saveName()} />
      </div>

      {error ? <div className="banner banner-danger">{error}</div> : null}

      <h3>Ingredients</h3>
      {meal.components.length === 0 ? <p className="muted">Search for a known food below to add your first ingredient.</p> : null}
      {meal.components.map((component) => (
        <div className="card" key={component.id}>
          <div>{component.label}</div>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`ingredient-${component.id}`}>Quantity ({componentUnitLabel(component)})</label>
            <input
              id={`ingredient-${component.id}`}
              type="number"
              inputMode="decimal"
              min="0"
              value={quantityDrafts[component.id] ?? ""}
              onChange={(event) => setQuantityDrafts((current) => ({ ...current, [component.id]: event.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-secondary" type="button" onClick={() => void saveQuantity(component)}>Save quantity</button>
            <button className="btn-secondary" type="button" onClick={() => void removeComponent(component.id)}>Remove</button>
          </div>
        </div>
      ))}

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h3>Add an ingredient</h3>
        <p className="muted">Search your saved foods or the Australian food database.</p>
        <div className="field">
          <label htmlFor="ingredient-search">Food name</label>
          <input
            id="ingredient-search"
            placeholder="e.g. protein powder, avocado, banana or coconut water"
            value={ingredientQuery}
            onChange={(event) => {
              setIngredientQuery(event.target.value);
              setOnlineLookup({ status: "idle", candidates: [] });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void searchKnownFoods();
              }
            }}
          />
        </div>
        <button className="btn-secondary" type="button" onClick={() => void searchKnownFoods()} disabled={!ingredientQuery.trim() || searching}>
          {searching ? "Searching…" : "Search known foods"}
        </button>

        {matchingCustomFoods.length > 0 || officialResults.length > 0 ? <div className="result-list" style={{ marginTop: "0.75rem" }}>
          {matchingCustomFoods.map((food) => {
            const choice: RecipeFoodChoice = { kind: "CUSTOM", food };
            return <button className="result-item" type="button" key={`custom-${food.id}`} onClick={() => void selectIngredient(choice)}>Your saved food · {food.name}</button>;
          })}
          {officialResults.map((food) => {
            const choice: RecipeFoodChoice = { kind: "OFFICIAL", food };
            return <button className="result-item" type="button" key={`${food.sourceDataset}-${food.sourceFoodId}`} onClick={() => void selectIngredient(choice)}>Australian food data · {food.foodName}</button>;
          })}
        </div> : null}
        {onlineLookup.status === "loading" ? <p className="muted" style={{ marginTop: "0.75rem" }}>No local match. Looking online for a possible product — nothing will be added unless you choose it.</p> : null}
        {onlineLookup.status === "ready" ? <div className="card" style={{ marginTop: "0.75rem" }}>
          <strong>Possible online matches</strong>
          <p className="muted">Community-contributed data. Check the product and carbohydrate basis before adding it to this recipe.</p>
          <div className="clarification-prompt__choices">
            {onlineLookup.candidates.map((candidate) => {
              const basis = candidate.carbohydratePerServingGrams !== null && candidate.servingDescription
                ? `${candidate.carbohydratePerServingGrams} g carb per ${candidate.servingDescription}`
                : `${candidate.carbohydratePer100gGrams} g carb per 100 g`;
              const choice: RecipeFoodChoice = { kind: "ONLINE", candidate };
              return <button className="btn-secondary" type="button" key={candidate.productCode} onClick={() => void selectIngredient(choice)}>Use {candidate.name}{candidate.brand ? ` — ${candidate.brand}` : ""} ({basis})</button>;
            })}
          </div>
        </div> : null}
        {onlineLookup.status === "unavailable" ? <div className="banner banner-warning" style={{ marginTop: "0.75rem" }}>I can’t find “{ingredientQuery.trim()}” in your foods or online right now. Try a brand, the full product name, or add its packet-label details as a custom food. Your recipe is still open and unchanged.</div> : null}

        {selectedFood ? <div className="card" style={{ marginTop: "0.75rem" }}>
          <strong>{choiceLabel(selectedFood)}</strong>
          <p className="muted">Choose the amount basis first. Only measures supplied for this known food are offered; no conversion is guessed.</p>
          <div className="clarification-prompt__choices" aria-label="Ingredient amount basis">
            {selectedCustomHasServing || selectedOnlineHasServing ? <button className="btn-secondary" type="button" onClick={() => chooseQuantityKind("SAVED_SERVING")} style={quantityKind === "SAVED_SERVING" ? { borderColor: "var(--accent)" } : undefined}>Serving ({selectedFood.kind === "CUSTOM" ? selectedFood.food.servingDescription ?? "saved serving" : selectedFood.kind === "ONLINE" ? selectedFood.candidate.servingDescription ?? "serving" : "saved serving"})</button> : null}
            <button className="btn-secondary" type="button" onClick={() => chooseQuantityKind("GRAMS")} style={quantityKind === "GRAMS" ? { borderColor: "var(--accent)" } : undefined}>g</button>
            {officialCanUseMillilitres ? <button className="btn-secondary" type="button" onClick={() => chooseQuantityKind("MILLILITRES")} style={quantityKind === "MILLILITRES" ? { borderColor: "var(--accent)" } : undefined}>mL</button> : null}
            {officialCanUseMeasures ? commonMeasures.map((measure) => <button key={measure.measureId} className="btn-secondary" type="button" onClick={() => chooseQuantityKind("MEASURE", measure.measureId)} style={quantityKind === "MEASURE" && selectedMeasureId === measure.measureId ? { borderColor: "var(--accent)" } : undefined}>{measure.measureDescription}</button>) : null}
          </div>
          {officialCanUseMeasures && additionalMeasures.length > 0 ? <details style={{ marginTop: "0.75rem" }}>
            <summary className="muted">More database measures</summary>
            <div className="clarification-prompt__choices">
              {additionalMeasures.map((measure) => <button key={measure.measureId} className="btn-secondary" type="button" onClick={() => chooseQuantityKind("MEASURE", measure.measureId)} style={quantityKind === "MEASURE" && selectedMeasureId === measure.measureId ? { borderColor: "var(--accent)" } : undefined}>{measure.measureDescription}</button>)}
            </div>
          </details> : null}
          <div className="field">
            <label htmlFor="ingredient-quantity">How many {quantityKind === "MILLILITRES" ? "mL" : quantityKind === "SAVED_SERVING" ? "servings" : quantityKind === "MEASURE" ? (measures.find((measure) => measure.measureId === selectedMeasureId)?.measureDescription ?? "measures") : "grams"}?</label>
            <input id="ingredient-quantity" type="number" inputMode="decimal" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </div>
          <button className="btn-primary" type="button" onClick={() => void addIngredient()} disabled={adding || !quantity || (quantityKind === "MEASURE" && !selectedMeasureId)}>
            {adding ? "Adding…" : "Add to recipe"}
          </button>
        </div> : null}
      </section>

      <div style={{ height: "1.5rem" }} />
      <button className="btn-primary" type="button" onClick={() => navigate("/meals")}>Done</button>
    </Screen>
  );
}
