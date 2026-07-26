import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  CustomFoodRecord,
  FoodSearchResult,
  SavedMealComponentRecord,
  SavedMealRecord,
} from "@diabetes-companion/food-contracts";
import { api, ApiError } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

export function MealEditScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meal, setMeal] = useState<SavedMealRecord | null>(null);
  const [name, setName] = useState("");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [customFoods, setCustomFoods] = useState<CustomFoodRecord[]>([]);
  const [selectedCustomFoodId, setSelectedCustomFoodId] = useState("");
  const [customFoodGrams, setCustomFoodGrams] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
  const [officialFoodGrams, setOfficialFoodGrams] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!id) return;
    api.getMeal(id).then(({ meal: loaded }) => {
      setMeal(loaded);
      setName(loaded.name);
      const drafts: Record<string, string> = {};
      for (const component of loaded.components) drafts[component.id] = component.quantityGrams ?? "";
      setQuantityDrafts(drafts);
    });
    api.listCustomFoods().then((response) => setCustomFoods(response.foods));
  };

  useEffect(load, [id]);

  const saveName = async () => {
    if (!id || !meal || name === meal.name) return;
    await api.renameMeal(id, name);
    load();
  };

  const saveQuantity = async (component: SavedMealComponentRecord) => {
    if (!id) return;
    setError(null);
    try {
      await api.updateMealComponent(id, component.id, {
        quantityKind: "GRAMS",
        quantityGrams: Number(quantityDrafts[component.id]),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update quantity.");
    }
  };

  const removeComponent = async (componentId: string) => {
    if (!id) return;
    await api.removeMealComponent(id, componentId);
    load();
  };

  const addCustomFoodComponent = async () => {
    if (!id || !selectedCustomFoodId) return;
    const food = customFoods.find((f) => f.id === selectedCustomFoodId);
    if (!food) return;
    setError(null);
    try {
      await api.addMealComponent(id, {
        componentSource: "CUSTOM",
        customFoodId: food.id,
        label: food.name,
        quantityKind: "GRAMS",
        quantityGrams: Number(customFoodGrams),
      });
      setCustomFoodGrams("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add component.");
    }
  };

  const runSearch = async () => {
    if (query.trim().length === 0) return;
    const response = await api.searchFoods(query.trim());
    setSearchResults(response.results as FoodSearchResult[]);
  };

  const addOfficialFoodComponent = async () => {
    if (!id || !selectedFood) return;
    setError(null);
    try {
      await api.addMealComponent(id, {
        componentSource: selectedFood.sourceDataset === "AUSNUT_2023" ? "AUSNUT" : "AFCD",
        sourceDataset: selectedFood.sourceDataset,
        sourceFoodId: selectedFood.sourceFoodId,
        label: selectedFood.foodName,
        quantityKind: "GRAMS",
        quantityGrams: Number(officialFoodGrams),
      });
      setSelectedFood(null);
      setOfficialFoodGrams("");
      setSearchResults([]);
      setQuery("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add component.");
    }
  };

  if (!meal) {
    return (
      <Screen title="Edit meal">
        <p className="muted">Loading…</p>
      </Screen>
    );
  }

  return (
    <Screen title="Edit meal">
      <div className="field">
        <label htmlFor="mealName">Meal name</label>
        <input id="mealName" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
      </div>

      {error ? <div className="banner banner-danger">{error}</div> : null}

      <h3>Components</h3>
      {meal.components.length === 0 ? <p className="muted">No components yet - add one below.</p> : null}
      {meal.components.map((component) => (
        <div className="card" key={component.id}>
          <div>{component.label}</div>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label>Quantity (g)</label>
            <input
              type="number"
              inputMode="decimal"
              value={quantityDrafts[component.id] ?? ""}
              onChange={(e) => setQuantityDrafts((prev) => ({ ...prev, [component.id]: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-secondary" onClick={() => saveQuantity(component)}>
              Save quantity
            </button>
            <button className="btn-secondary" onClick={() => removeComponent(component.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}

      <h3 style={{ marginTop: "1.5rem" }}>Add a custom food</h3>
      <div className="field">
        <select value={selectedCustomFoodId} onChange={(e) => setSelectedCustomFoodId(e.target.value)}>
          <option value="">Select a custom food…</option>
          {customFoods.map((food) => (
            <option key={food.id} value={food.id}>
              {food.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Quantity (g)</label>
        <input type="number" inputMode="decimal" value={customFoodGrams} onChange={(e) => setCustomFoodGrams(e.target.value)} />
      </div>
      <button
        className="btn-secondary"
        onClick={addCustomFoodComponent}
        disabled={!selectedCustomFoodId || !customFoodGrams}
      >
        Add custom food
      </button>

      <h3 style={{ marginTop: "1.5rem" }}>Add an Australian food</h3>
      <div className="field">
        <input placeholder="Search foods" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <button className="btn-secondary" onClick={runSearch} disabled={query.trim().length === 0}>
        Search
      </button>
      <ul className="result-list">
        {searchResults.map((food) => (
          <li key={`${food.sourceDataset}-${food.sourceFoodId}`}>
            <button
              className="result-item"
              onClick={() => setSelectedFood(food)}
              style={selectedFood?.sourceFoodId === food.sourceFoodId ? { borderColor: "var(--accent)" } : undefined}
            >
              {food.foodName}
            </button>
          </li>
        ))}
      </ul>
      {selectedFood ? (
        <>
          <div className="field">
            <label>Quantity (g) for {selectedFood.foodName}</label>
            <input
              type="number"
              inputMode="decimal"
              value={officialFoodGrams}
              onChange={(e) => setOfficialFoodGrams(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={addOfficialFoodComponent} disabled={!officialFoodGrams}>
            Add {selectedFood.foodName}
          </button>
        </>
      ) : null}

      <div style={{ height: "1.5rem" }} />
      <button className="btn-primary" onClick={() => navigate("/meals")}>
        Done
      </button>
    </Screen>
  );
}
