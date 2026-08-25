import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell.js";
import { MacroGrid } from "../components/MacroGrid.js";
import { api, todayLocal, userTimezone } from "../lib/api.js";
import { formatNutrient, type NutrientPanel, type NutritionMealLog, type NutritionTargets } from "@diabetes-companion/food-engine";

export function TodayScreen() {
  const navigate = useNavigate();
  const timezone = userTimezone();
  const date = todayLocal(timezone);
  const [totals, setTotals] = useState<NutrientPanel | null>(null);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [meals, setMeals] = useState<NutritionMealLog[]>([]);
  const [insight, setInsight] = useState<string[]>([]);
  const [completeness, setCompleteness] = useState("unmarked");
  const [remaining, setRemaining] = useState<Record<string, { copy: string | null }>>({});
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const day = await api.getDay(date, timezone);
      setTotals(day.totals);
      setTargets(day.targets);
      setMeals(day.meals);
      setInsight(day.insight.statements.map((row) => row.text));
      setCompleteness(day.completeness);
      setRemaining(day.remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load today.");
    }
  };

  useEffect(() => {
    void load();
  }, [date, timezone]);

  const grouped = ["breakfast", "lunch", "dinner", "snack", "drink", "other"].map((type) => ({
    type,
    meals: meals.filter((meal) => meal.mealType === type),
  }));

  return (
    <Shell title="Today">
      {error ? <div className="banner banner-danger">{error}</div> : null}
      <div className="log-hero">
        <button className="btn-primary" type="button" onClick={() => navigate("/log")}>
          Log food
        </button>
        <button
          className="btn-secondary"
          type="button"
          onClick={() => {
            const yesterday = meals.length ? null : null;
            void (async () => {
              const listed = await api.listMeals();
              const y = new Date();
              y.setDate(y.getDate() - 1);
              const yDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(y);
              const previous = listed.meals.filter((meal) => meal.localDate === yDate);
              const breakfast = previous.find((meal) => meal.mealType === "breakfast") ?? previous[0];
              if (!breakfast) {
                setError("No meal from yesterday to copy.");
                return;
              }
              await api.repeatMeal(breakfast.id);
              await load();
            })();
            void yesterday;
          }}
        >
          Copy yesterday
        </button>
        <p className="muted">Microphone and text are on the next screen. Logging should take seconds.</p>
      </div>
      {totals ? <MacroGrid totals={totals} targets={targets} /> : <p className="muted">Loading…</p>}
      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Today</h2>
        {insight.length === 0 ? <p className="muted">No meals yet. Log breakfast to get started.</p> : insight.map((text) => <p key={text}>{text}</p>)}
        {remaining.proteinG?.copy ? <p className="muted">{remaining.proteinG.copy}</p> : null}
        {remaining.fibreG?.copy ? <p className="muted">{remaining.fibreG.copy}</p> : null}
        {remaining.sodiumMg?.copy ? <p className="muted">{remaining.sodiumMg.copy}</p> : null}
      </div>
      {grouped.map((group) => (
        <div className="card" key={group.type}>
          <h3>{group.type[0]!.toUpperCase() + group.type.slice(1)}</h3>
          {group.meals.length === 0 ? <p className="muted">Nothing logged.</p> : null}
          {group.meals.map((meal) => (
            <Link key={meal.id} to={`/history/${meal.id}`} className="list-button" style={{ display: "block", textDecoration: "none" }}>
              <strong>{meal.items.map((item) => item.identity.foodName).join(", ") || meal.originalText}</strong>
              <div className="muted">{formatNutrient(meal.totals.energyKcal, "kcal")} · {formatNutrient(meal.totals.proteinG, "g protein")}</div>
            </Link>
          ))}
        </div>
      ))}
      <div className="card">
        <h3>Day completeness</h3>
        <p className="muted">Marking complete makes weekly averages more trustworthy. Unlogged time is never treated as zero intake.</p>
        <div className="btn-row">
          <button className="btn-secondary" type="button" onClick={() => void api.setCompleteness(date, "complete").then(load)}>
            Complete
          </button>
          <button className="btn-secondary" type="button" onClick={() => void api.setCompleteness(date, "partial").then(load)}>
            Partially logged
          </button>
        </div>
        <p className="muted">Current: {completeness}</p>
      </div>
    </Shell>
  );
}
