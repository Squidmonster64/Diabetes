import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CustomFoodRecord } from "@diabetes-companion/food-contracts";
import { api } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

export function CustomFoodsListScreen() {
  const [foods, setFoods] = useState<CustomFoodRecord[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () => {
    setFoods(null);
    api
      .listCustomFoods(showArchived)
      .then((response) => setFoods(response.foods))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load custom foods."));
  };

  useEffect(load, [showArchived]);

  const toggleArchive = async (food: CustomFoodRecord) => {
    if (food.archivedAt) await api.unarchiveCustomFood(food.id);
    else await api.archiveCustomFood(food.id);
    load();
  };

  return (
    <Screen title="My custom foods">
      {error ? <div className="banner banner-danger">{error}</div> : null}
      <button className="btn-primary" onClick={() => navigate("/custom-foods/new")}>
        Add a custom food
      </button>
      <label className="checkbox-row" style={{ marginTop: "1rem" }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        <span>Show archived</span>
      </label>

      {foods === null && !error ? <p className="muted">Loading…</p> : null}
      {foods && foods.length === 0 ? <p className="muted">No custom foods yet.</p> : null}
      <ul className="result-list">
        {foods?.map((food) => (
          <li key={food.id}>
            <div className="card">
              <div>
                {food.name} {food.archivedAt ? <span className="badge">archived</span> : null}
              </div>
              <div className="muted">
                {food.brand ? `${food.brand} · ` : ""}
                {food.carbohydratePer100gGrams} g carbohydrate per 100 g
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <Link to={`/custom-foods/${food.id}/edit`}>
                  <button className="btn-secondary">Edit</button>
                </Link>
                <button className="btn-secondary" onClick={() => toggleArchive(food)}>
                  {food.archivedAt ? "Unarchive" : "Archive"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
