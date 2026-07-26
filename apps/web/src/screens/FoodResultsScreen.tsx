import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { FoodSearchResult } from "@diabetes-companion/food-contracts";
import { api } from "../lib/apiClient.js";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

export function FoodResultsScreen() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [results, setResults] = useState<FoodSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setSelectedFood } = useWorkflow();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setResults(null);
    setError(null);
    api
      .searchFoods(query)
      .then((response) => {
        if (!cancelled) setResults(response.results as FoodSearchResult[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Search failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const selectFood = (food: FoodSearchResult) => {
    setSelectedFood(food);
    navigate(`/food/${food.sourceDataset}/${encodeURIComponent(food.sourceFoodId)}`);
  };

  return (
    <Screen title={`Results for "${query}"`}>
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {results === null && !error ? <p className="muted">Searching…</p> : null}
      {results && results.length === 0 ? (
        <p className="muted">No matching foods were found. Try a different spelling or a shorter search term.</p>
      ) : null}
      <ul className="result-list">
        {results?.map((food) => (
          <li key={`${food.sourceDataset}-${food.sourceFoodId}`}>
            <button className="result-item" onClick={() => selectFood(food)}>
              <div>{food.foodName}</div>
              <span className="badge">{food.sourceDataset === "AUSNUT_2023" ? "AUSNUT" : "AFCD"}</span>
              <span className="badge">{food.matchType}</span>
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
