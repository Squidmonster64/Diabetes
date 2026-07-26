import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

export function MealCreateScreen() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const meal = await api.createMeal({ name, components: [] });
      navigate(`/meals/${meal.id}/edit`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Could not create meal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title="Create a new meal">
      <p className="muted">Name your reusable meal. You'll add its food components next.</p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="mealName">Meal name</label>
          <input id="mealName" required placeholder="e.g. Usual breakfast" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error ? <div className="banner banner-danger">{error}</div> : null}
        <button className="btn-primary" type="submit" disabled={submitting || name.trim().length === 0}>
          Create and add components
        </button>
      </form>
    </Screen>
  );
}
