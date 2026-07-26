import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/apiClient.js";
import { Screen } from "../components/Screen.js";

export function CustomFoodFormScreen() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [foodType, setFoodType] = useState<"PACKET_LABEL" | "MANUAL">("PACKET_LABEL");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingDescription, setServingDescription] = useState("");
  const [servingGrams, setServingGrams] = useState("");
  const [carbohydratePerServingGrams, setCarbohydratePerServingGrams] = useState("");
  const [carbohydratePer100gGrams, setCarbohydratePer100gGrams] = useState("");
  const [useDirectPer100g, setUseDirectPer100g] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getCustomFood(id).then((food) => {
      setFoodType(food.foodType);
      setName(food.name);
      setBrand(food.brand ?? "");
      setServingDescription(food.servingDescription ?? "");
      setServingGrams(food.servingGrams ?? "");
      setCarbohydratePerServingGrams(food.carbohydratePerServingGrams ?? "");
      setCarbohydratePer100gGrams(food.carbohydratePer100gGrams ?? "");
      setUseDirectPer100g(!food.servingGrams);
    });
  }, [id]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        foodType,
        name,
        brand: brand || null,
      };
      if (useDirectPer100g) {
        body.carbohydratePer100gGrams = Number(carbohydratePer100gGrams);
      } else {
        body.servingDescription = servingDescription || null;
        body.servingGrams = Number(servingGrams);
        body.carbohydratePerServingGrams = Number(carbohydratePerServingGrams);
      }
      if (isEditing && id) {
        await api.updateCustomFood(id, body);
      } else {
        await api.createCustomFood(body);
      }
      navigate("/custom-foods");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Could not save custom food.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title={isEditing ? "Edit custom food" : "Add a custom food"}>
      <p className="muted">
        Enter values exactly as printed on the packet nutrition panel, or enter a manual estimate. This app never
        derives or suggests a carbohydrate value for you.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="foodType">Type</label>
          <select id="foodType" value={foodType} onChange={(e) => setFoodType(e.target.value as never)}>
            <option value="PACKET_LABEL">Packet label (from a nutrition panel)</option>
            <option value="MANUAL">Manual estimate</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="brand">Brand (optional)</label>
          <input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={useDirectPer100g} onChange={(e) => setUseDirectPer100g(e.target.checked)} />
          <span>I know the carbohydrate per 100 g directly</span>
        </label>

        {useDirectPer100g ? (
          <div className="field">
            <label htmlFor="per100g">Carbohydrate per 100 g</label>
            <input
              id="per100g"
              type="number"
              inputMode="decimal"
              required
              value={carbohydratePer100gGrams}
              onChange={(e) => setCarbohydratePer100gGrams(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="servingDescription">Serving description (e.g. "1 bar")</label>
              <input
                id="servingDescription"
                value={servingDescription}
                onChange={(e) => setServingDescription(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="servingGrams">Serving size (grams)</label>
              <input
                id="servingGrams"
                type="number"
                inputMode="decimal"
                required
                value={servingGrams}
                onChange={(e) => setServingGrams(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="carbPerServing">Carbohydrate per serving (grams)</label>
              <input
                id="carbPerServing"
                type="number"
                inputMode="decimal"
                required
                value={carbohydratePerServingGrams}
                onChange={(e) => setCarbohydratePerServingGrams(e.target.value)}
              />
            </div>
          </>
        )}

        {error ? <div className="banner banner-danger">{error}</div> : null}

        <button className="btn-primary" type="submit" disabled={submitting}>
          {isEditing ? "Save changes" : "Add custom food"}
        </button>
      </form>
    </Screen>
  );
}
