import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SavedMealRecord } from "@diabetes-companion/food-contracts";
import { api } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

export function MealsListScreen() {
  const [meals, setMeals] = useState<SavedMealRecord[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () => {
    setMeals(null);
    api
      .listMeals(showArchived)
      .then((response) => setMeals(response.meals))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load meals."));
  };

  useEffect(load, [showArchived]);

  const toggleArchive = async (meal: SavedMealRecord) => {
    if (meal.archivedAt) await api.unarchiveMeal(meal.id);
    else await api.archiveMeal(meal.id);
    load();
  };

  const duplicate = async (meal: SavedMealRecord) => {
    await api.duplicateMeal(meal.id, `Copy of ${meal.name}`);
    load();
  };

  return (
    <Screen title="My saved meals">
      {error ? <div className="banner banner-danger">{error}</div> : null}
      <button className="btn-primary" onClick={() => navigate("/meals/new")}>
        Create a new meal
      </button>
      <label className="checkbox-row" style={{ marginTop: "1rem" }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        <span>Show archived</span>
      </label>

      {meals === null && !error ? <p className="muted">Loading…</p> : null}
      {meals && meals.length === 0 ? <p className="muted">No saved meals yet.</p> : null}
      <ul className="result-list">
        {meals?.map((meal) => (
          <li key={meal.id}>
            <div className="card">
              <div>
                {meal.name} {meal.archivedAt ? <span className="badge">archived</span> : null}
              </div>
              <div className="muted">{meal.components.length} component(s)</div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                <Link to={`/meals/${meal.id}/use`}>
                  <button className="btn-primary">Use</button>
                </Link>
                <Link to={`/meals/${meal.id}/edit`}>
                  <button className="btn-secondary">Edit</button>
                </Link>
                <button className="btn-secondary" onClick={() => duplicate(meal)}>
                  Duplicate
                </button>
                <button className="btn-secondary" onClick={() => toggleArchive(meal)}>
                  {meal.archivedAt ? "Unarchive" : "Archive"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
