import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell.js";
import { api, saveDraft, userTimezone } from "../lib/api.js";
import { emptyPanel, type NutritionMealItem } from "@diabetes-companion/food-engine";

export function FoodsScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"recent" | "favourites" | "saved" | "custom" | "recipes">("recent");
  const [recent, setRecent] = useState<NutritionMealItem[]>([]);
  const [favourites, setFavourites] = useState<Array<{ id: string; foodName: string }>>([]);
  const [saved, setSaved] = useState<Array<{ id: string; name: string; items: NutritionMealItem[] }>>([]);
  const [custom, setCustom] = useState<Array<{ id: string; name: string }>>([]);
  const [recipes, setRecipes] = useState<Array<{ id: string; name: string; items: NutritionMealItem[] }>>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ foodName: string; sourceDataset: string; sourceFoodId: string }>>([]);
  const [customName, setCustomName] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [savedName, setSavedName] = useState("");

  const reload = () => {
    void api.recentFoods().then((res) => setRecent(res.foods));
    void api.favourites().then((res) => setFavourites(res.favourites));
    void api.savedMeals().then((res) => setSaved(res.meals));
    void api.customFoods().then((res) => setCustom(res.foods));
    void api.recipes().then((res) => setRecipes(res.recipes));
  };
  useEffect(() => { reload(); }, []);

  const useItems = async (text: string) => {
    const interpreted = await api.interpret({ text, sourceType: "text", timezone: userTimezone() });
    saveDraft({ ...interpreted, mealType: interpreted.inferredMealType, timezone: userTimezone(), loggedAt: new Date().toISOString(), sourceType: "text" });
    navigate("/confirm");
  };

  return (
    <Shell title="Foods">
      <div className="field">
        <label htmlFor="search">Search library</label>
        <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="food or brand" />
        <button className="btn-secondary" type="button" onClick={() => void api.searchFoods(query).then((res) => setResults(res.results))}>Search</button>
      </div>
      {results.map((result) => (
        <button key={result.sourceFoodId} className="list-button" type="button" onClick={() => void useItems(result.foodName)}>
          {result.foodName}
        </button>
      ))}
      <div className="range-tabs">
        {(["recent", "favourites", "saved", "custom", "recipes"] as const).map((item) => (
          <button key={item} type="button" className={item === tab ? "active" : ""} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "recent" ? recent.map((food) => (
        <button key={food.id} className="list-button" type="button" onClick={() => void useItems(food.identity.foodName)}>
          {food.identity.foodName}
          <div className="muted">Last used {food.serving.quantity} {food.serving.unit}</div>
        </button>
      )) : null}
      {tab === "favourites" ? favourites.map((food) => (
        <div key={food.id} className="btn-row">
          <button className="list-button" type="button" onClick={() => void useItems(food.foodName)}>{food.foodName}</button>
        </div>
      )) : null}
      {tab === "saved" ? (
        <>
          <div className="field"><label>Save last interpreted combination as</label><input value={savedName} onChange={(e) => setSavedName(e.target.value)} placeholder="Usual breakfast" /></div>
          {saved.map((meal) => (
            <button key={meal.id} className="list-button" type="button" onClick={() => void useItems(meal.name)}>{meal.name}</button>
          ))}
        </>
      ) : null}
      {tab === "custom" ? (
        <>
          <div className="field"><label>Name</label><input value={customName} onChange={(e) => setCustomName(e.target.value)} /></div>
          <div className="field"><label>Protein g / 100g</label><input value={customProtein} onChange={(e) => setCustomProtein(e.target.value)} inputMode="decimal" /></div>
          <button className="btn-secondary" type="button" onClick={() => void api.createCustomFood({
            name: customName,
            nutrientsPer100g: { ...emptyPanel(), proteinG: Number(customProtein) || null },
          }).then(reload)}>Create custom food</button>
          {custom.map((food) => <div key={food.id} className="muted">{food.name}</div>)}
        </>
      ) : null}
      {tab === "recipes" ? recipes.map((recipe) => (
        <button key={recipe.id} className="list-button" type="button" onClick={() => void useItems(recipe.name)}>{recipe.name}</button>
      )) : null}
    </Shell>
  );
}
