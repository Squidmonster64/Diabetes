import { createContext, useContext, useState, type ReactNode } from "react";
import type { CarbohydrateCalculationResult, FoodSearchResult } from "@diabetes-companion/food-contracts";

export interface PriorRapidActingDoseEntry {
  readonly units: string;
  readonly administeredAt: string;
}

export interface GlucoseEntry {
  readonly currentGlucose: string;
  readonly glucoseUnit: "MMOL_L" | "MG_DL";
  readonly glucoseTimestamp: string;
  readonly glucoseSource: "FINGERSTICK" | "CGM" | "MANUAL_TRANSCRIPTION";
  readonly activeInsulinUnits: string | null;
  readonly recentHistoryComplete: boolean;
  readonly hypoSymptoms: boolean;
  readonly duplicateDose: boolean;
  readonly concentratedInsulinConfirmed: boolean;
  /** Prior rapid-acting doses known at entry time - populated by the natural-language
   * review flow so the existing ACTIVE_PRIOR_BOLUS gate in packages/bolus (unmodified)
   * can evaluate them; empty when entering a bolus manually with no known prior dose. */
  readonly priorRapidActingDoses?: readonly PriorRapidActingDoseEntry[];
  /** Special-situation cues carried over from natural-language parsing, still just a
   * pre-fill - the user must still review and can add/remove before confirming. */
  readonly specialSituations?: readonly string[];
}

interface WorkflowState {
  selectedFood: FoodSearchResult | null;
  carbResult: CarbohydrateCalculationResult | null;
  glucoseEntry: GlucoseEntry | null;
  previewResult: unknown | null;
  setSelectedFood(food: FoodSearchResult | null): void;
  setCarbResult(result: CarbohydrateCalculationResult | null): void;
  setGlucoseEntry(entry: GlucoseEntry | null): void;
  setPreviewResult(result: unknown | null): void;
  reset(): void;
}

const WorkflowContext = createContext<WorkflowState | undefined>(undefined);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
  const [carbResult, setCarbResult] = useState<CarbohydrateCalculationResult | null>(null);
  const [glucoseEntry, setGlucoseEntry] = useState<GlucoseEntry | null>(null);
  const [previewResult, setPreviewResult] = useState<unknown | null>(null);

  const reset = () => {
    setSelectedFood(null);
    setCarbResult(null);
    setGlucoseEntry(null);
    setPreviewResult(null);
  };

  return (
    <WorkflowContext.Provider
      value={{
        selectedFood,
        carbResult,
        glucoseEntry,
        previewResult,
        setSelectedFood,
        setCarbResult,
        setGlucoseEntry,
        setPreviewResult,
        reset,
      }}
    >
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow(): WorkflowState {
  const context = useContext(WorkflowContext);
  if (!context) throw new Error("useWorkflow must be used within WorkflowProvider");
  return context;
}
