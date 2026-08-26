import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.js";
import { api } from "../lib/api.js";
import { formatNutrient, type NutritionMealLog } from "@diabetes-companion/food-engine";

export function HistoryScreen() {
  const [meals, setMeals] = useState<NutritionMealLog[]>([]);
  const [query, setQuery] = useState("");
  const [mealType, setMealType] = useState("");
  useEffect(() => {
    void api.listMeals().then((res) => setMeals([...res.meals].reverse()));
  }, []);
  const filtered = meals.filter((meal) => {
    const hay = `${meal.originalText} ${meal.items.map((item) => item.identity.foodName).join(" ")}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (mealType && meal.mealType !== mealType) return false;
    return true;
  });
  return (
    <Shell title="History">
      <div className="field"><label htmlFor="q">Search foods or meals</label><input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="salmon" /></div>
      <div className="field">
        <label htmlFor="type">Meal type</label>
        <select id="type" value={mealType} onChange={(e) => setMealType(e.target.value)}>
          <option value="">All</option>
          {["breakfast", "lunch", "dinner", "snack", "drink", "other"].map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>
      {filtered.map((meal) => (
        <Link key={meal.id} to={`/history/${meal.id}`} className="list-button" style={{ display: "block", textDecoration: "none" }}>
          <div>{meal.localDate} · {meal.mealType}</div>
          <strong>{meal.items.map((item) => item.identity.foodName).join(", ") || meal.originalText}</strong>
          <div className="muted">{formatNutrient(meal.totals.energyKcal, "kcal")} · {formatNutrient(meal.totals.proteinG, "g protein")}</div>
        </Link>
      ))}
      {filtered.length === 0 ? <p className="muted">No meals match.</p> : null}
    </Shell>
  );
}

export function MealDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meal, setMeal] = useState<NutritionMealLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    void api.getMeal(id).then(setMeal).catch((err: Error) => setError(err.message));
  }, [id]);
  if (!meal) {
    return <Shell title="Meal">{error ? <div className="banner banner-danger">{error}</div> : <p className="muted">Loading…</p>}</Shell>;
  }
  return (
    <Shell title={meal.mealType}>
      <p className="muted">{meal.localDate} · {meal.originalText}</p>
      {meal.items.map((item) => (
        <div className="meal-item" key={item.id}>
          <div className="meal-item__name">{item.identity.foodName}</div>
          <div className="muted">{item.serving.quantity} {item.serving.unit} {item.serving.grams ? `(${item.serving.grams} g)` : ""}</div>
          {item.assumptions.map((assumption) => <div className="assumption" key={assumption}>{assumption}</div>)}
          <div className="muted">{formatNutrient(item.nutrients.energyKcal, "kcal")} · P {formatNutrient(item.nutrients.proteinG)} · C {formatNutrient(item.nutrients.carbohydrateG)} · F {formatNutrient(item.nutrients.fatG)} · Na {formatNutrient(item.nutrients.sodiumMg, "mg")}</div>
        </div>
      ))}
      <div className="btn-row">
        <button className="btn-secondary" type="button" onClick={() => void api.repeatMeal(meal.id).then(() => navigate("/"))}>Repeat</button>
        <button className="btn-danger" type="button" onClick={() => {
          if (window.confirm("Delete this meal?")) void api.deleteMeal(meal.id).then(() => navigate("/history"));
        }}>Delete</button>
      </div>
    </Shell>
  );
}
