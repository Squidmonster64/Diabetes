import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FoodMeasure } from "@diabetes-companion/food-contracts";
import { api } from "../lib/apiClient.js";
import { useWorkflow } from "../state/WorkflowContext.js";
import { Screen } from "../components/Screen.js";

export function PortionSelectionScreen() {
  const { sourceDataset, sourceFoodId } = useParams();
  const { selectedFood, setCarbResult } = useWorkflow();
  const [measures, setMeasures] = useState<FoodMeasure[]>([]);
  const [grams, setGrams] = useState("");
  const [millilitres, setMillilitres] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!sourceDataset || !sourceFoodId) return;
    if (sourceDataset !== "AUSNUT_2023") return;
    api
      .getMeasures(sourceDataset, sourceFoodId)
      .then((response) => setMeasures(response.measures as FoodMeasure[]))
      .catch(() => setMeasures([]));
  }, [sourceDataset, sourceFoodId]);

  const goToSummary = async (body: Record<string, unknown>) => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.calculateCarbohydrate({ sourceDataset, sourceFoodId, ...body });
      setCarbResult(result as never);
      navigate("/carb-summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not calculate carbohydrate.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title="Portion">
      <h2>{selectedFood?.foodName ?? "Selected food"}</h2>
      {error ? <div className="banner banner-danger">{error}</div> : null}

      {measures.length > 0 ? (
        <>
          <p className="muted">Household measures</p>
          {measures.map((measure) => (
            <div className="card" key={measure.measureId}>
              <div>{measure.measureDescription}</div>
              <button
                className="btn-secondary"
                disabled={submitting}
                onClick={() =>
                  goToSummary({ kind: "MEASURE", measureId: measure.measureId, measureMultiplier: 1 })
                }
              >
                Use this measure
              </button>
            </div>
          ))}
        </>
      ) : null}

      <p className="muted" style={{ marginTop: "1.5rem" }}>
        Or enter grams directly
      </p>
      <div className="field">
        <label htmlFor="grams">Grams</label>
        <input
          id="grams"
          type="number"
          inputMode="decimal"
          min="0"
          value={grams}
          onChange={(event) => setGrams(event.target.value)}
        />
      </div>
      <button
        className="btn-primary"
        disabled={submitting || !grams || Number(grams) <= 0}
        onClick={() => goToSummary({ kind: "GRAMS", grams: Number(grams) })}
      >
        Use {grams || "0"} g
      </button>

      {selectedFood?.hasMillilitreData ? (
        <>
          <p className="muted" style={{ marginTop: "1.5rem" }}>
            Or enter millilitres (liquid)
          </p>
          <div className="field">
            <label htmlFor="millilitres">Millilitres</label>
            <input
              id="millilitres"
              type="number"
              inputMode="decimal"
              min="0"
              value={millilitres}
              onChange={(event) => setMillilitres(event.target.value)}
            />
          </div>
          <button
            className="btn-secondary"
            disabled={submitting || !millilitres || Number(millilitres) <= 0}
            onClick={() => goToSummary({ kind: "MILLILITRES", millilitres: Number(millilitres) })}
          >
            Use {millilitres || "0"} mL
          </button>
        </>
      ) : null}
    </Screen>
  );
}
