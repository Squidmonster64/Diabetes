import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Screen } from "../components/Screen.js";

export function FoodSearchScreen() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length === 0) return;
    navigate(`/food/results?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <Screen title="Food search">
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="query">Search for an Australian food</label>
          <input
            id="query"
            type="search"
            autoFocus
            placeholder="e.g. Weet-Bix, apple, milk"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button className="btn-primary" type="submit" disabled={query.trim().length === 0}>
          Search
        </button>
      </form>
      <p className="muted" style={{ marginTop: "2rem" }}>
        Results are ranked from the AUSNUT 2023 and AFCD Release 3 Australian food composition databases.
      </p>
    </Screen>
  );
}
