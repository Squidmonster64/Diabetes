import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell.js";
import { MacroGrid } from "../components/MacroGrid.js";
import { ApiError, api, clearDraft, loadDraft, saveDraft } from "../lib/api.js";
import { formatNutrient, MEAL_TYPES, sumNutrients, type NutritionMealItem } from "@diabetes-companion/food-engine";

export function ConfirmMealScreen() {
  const navigate = useNavigate();
  const initial = useMemo(() => loadDraft(), []);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ foodName: string; sourceDataset: string; sourceFoodId: string }>>([]);
  const [duplicate, setDuplicate] = useState(Boolean(initial?.duplicateOf));

  if (!draft) {
    return (
      <Shell title="Your meal">
        <p>Nothing to confirm. Start by logging a meal.</p>
        <button className="btn-primary" type="button" onClick={() => navigate("/log")}>Log food</button>
      </Shell>
    );
  }

  const updateItems = (items: NutritionMealItem[]) => {
    const next = { ...draft, items, totals: sumNutrients(items.map((item) => item.nutrients)) };
    setDraft(next);
    saveDraft(next);
  };

  const applyEdit = async (index: number, extra: Record<string, unknown> = {}) => {
    const item = draft.items[index];
    if (!item) return;
    setBusy(true);
    try {
      const resolved = await api.resolveItem({
        phrase: item.identity.foodName,
        text: `${qty || item.serving.quantity || ""} ${unit || item.serving.unit || ""} ${item.identity.foodName}`,
        quantity: qty ? Number(qty) : item.serving.quantity,
        unit: unit || item.serving.unit,
        sourceDataset: extra.sourceDataset ?? item.identity.sourceDataset,
        sourceFoodId: extra.sourceFoodId ?? item.identity.sourceFoodId,
        customFoodId: item.identity.customFoodId,
        measureId: extra.measureId,
      });
      const items = [...draft.items];
      items[index] = resolved.expanded[0] ?? resolved.item;
      updateItems(items);
      setEditing(null);
      void api.track("parse_corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recalculate.");
    } finally {
      setBusy(false);
    }
  };

  const log = async (confirmDuplicate = false) => {
    setBusy(true);
    setError(null);
    try {
      await api.logMeal({
        originalText: draft.originalText,
        transcription: draft.transcription,
        mealType: draft.mealType,
        timezone: draft.timezone,
        loggedAt: draft.loggedAt,
        parseVersion: draft.parseVersion,
        promptVersion: draft.promptVersion,
        modelVersion: draft.modelVersion,
        items: draft.items,
        warnings: draft.warnings,
        source: draft.sourceType,
        confirmDuplicate,
      });
      clearDraft();
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_MEAL") {
        setDuplicate(true);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Could not log meal.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Your meal">
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {draft.transcription ? (
        <div className="card">
          <h3>Transcription</h3>
          <p>{draft.transcription}</p>
          <p className="muted">Correct any speech errors in the original text before logging if needed.</p>
        </div>
      ) : (
        <div className="card"><p>{draft.originalText}</p></div>
      )}
      {draft.warnings.map((warning) => (
        <div className="banner banner-warning" key={warning}>{warning}</div>
      ))}
      <div className="field">
        <label htmlFor="mealType">Meal</label>
        <select id="mealType" value={draft.mealType} onChange={(event) => {
          const next = { ...draft, mealType: event.target.value };
          setDraft(next);
          saveDraft(next);
        }}>
          {MEAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>
      {draft.items.map((item, index) => (
        <div className="meal-item" key={item.id}>
          <div className="meal-item__name">
            {item.identity.foodName}
            {item.matchStatus !== "resolved" ? <span className="status-chip">{item.matchStatus.replace("_", " ")}</span> : null}
          </div>
          <div className="muted">
            {item.serving.quantity ?? "?"} {item.serving.unit ?? ""} {item.serving.grams ? `(${item.serving.grams} g)` : ""}
          </div>
          {item.assumptions.map((assumption) => <div className="assumption" key={assumption}>{assumption}</div>)}
          <div className="muted">{formatNutrient(item.nutrients.energyKcal, "kcal")} · {formatNutrient(item.nutrients.proteinG, "g protein")}</div>
          {editing === index ? (
            <div className="card">
              <div className="field"><label>Quantity</label><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" /></div>
              <div className="field">
                <label>Unit</label>
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {["g", "ml", "slice", "whole", "piece", "cup", "tablespoon", "teaspoon", "serving", "packet"].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Search a different food</label>
                <input value={search} onChange={(e) => setSearch(e.target.value)} />
                <button className="btn-secondary" type="button" onClick={() => void api.searchFoods(search).then((res) => setResults(res.results))}>Search</button>
                {results.map((result) => (
                  <button key={result.sourceFoodId} className="list-button" type="button" onClick={() => void applyEdit(index, { sourceDataset: result.sourceDataset, sourceFoodId: result.sourceFoodId })}>
                    {result.foodName}
                  </button>
                ))}
              </div>
              <div className="btn-row">
                <button className="btn-primary" type="button" onClick={() => void applyEdit(index)} disabled={busy}>Recalculate</button>
                <button className="btn-secondary" type="button" onClick={() => setEditing(null)}>Close</button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary" type="button" onClick={() => { setEditing(index); setQty(String(item.serving.quantity ?? "")); setUnit(item.serving.unit ?? "g"); }}>
              Edit
            </button>
          )}
        </div>
      ))}
      <div className="card">
        <h3>Total</h3>
        <MacroGrid totals={draft.totals} targets={null} />
      </div>
      {duplicate ? (
        <button className="btn-primary" type="button" disabled={busy} onClick={() => void log(true)}>
          Log anyway
        </button>
      ) : (
        <button className="btn-primary" type="button" disabled={busy} onClick={() => void log(false)}>
          Log meal
        </button>
      )}
      <div style={{ height: 8 }} />
      <button
        className="btn-secondary"
        type="button"
        onClick={() => {
          const name = window.prompt("Name this saved meal", "Usual breakfast");
          if (!name) return;
          void api.saveMeal({ name, items: draft.items }).then(() => setError(null));
        }}
      >
        Save meal for later
      </button>
    </Shell>
  );
}
