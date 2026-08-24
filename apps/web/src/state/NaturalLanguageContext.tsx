import { createContext, useContext, useState, type ReactNode } from "react";
import type { CaptureInterpretation, IntentClassification, ProposedNextStep, ProvisionalEvent } from "@diabetes-companion/natural-language";
import type { ResolvedFoodComponent } from "../lib/foodMatch.js";

/**
 * Carries a capture (immutable source) plus its review-only interpretation
 * draft from entry to review. The original text is never overwritten here.
 */
interface NaturalLanguageState {
  captureId: string | null;
  captureCode: string | null;
  provisionalEvent: ProvisionalEvent | null;
  resolvedComponents: readonly ResolvedFoodComponent[];
  intent: IntentClassification | null;
  proposedNextStep: ProposedNextStep | null;
  setDraft(
    event: ProvisionalEvent | null,
    resolvedComponents: readonly ResolvedFoodComponent[],
    capture?: { id: string; captureCode: string; interpretation: CaptureInterpretation } | null,
  ): void;
  reset(): void;
}

const NaturalLanguageContext = createContext<NaturalLanguageState | undefined>(undefined);

export function NaturalLanguageProvider({ children }: { children: ReactNode }) {
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [captureCode, setCaptureCode] = useState<string | null>(null);
  const [provisionalEvent, setProvisionalEvent] = useState<ProvisionalEvent | null>(null);
  const [resolvedComponents, setResolvedComponents] = useState<readonly ResolvedFoodComponent[]>([]);
  const [intent, setIntent] = useState<IntentClassification | null>(null);
  const [proposedNextStep, setProposedNextStep] = useState<ProposedNextStep | null>(null);

  const setDraft = (
    event: ProvisionalEvent | null,
    components: readonly ResolvedFoodComponent[],
    capture?: { id: string; captureCode: string; interpretation: CaptureInterpretation } | null,
  ) => {
    setProvisionalEvent(event);
    setResolvedComponents(components);
    if (capture) {
      setCaptureId(capture.id);
      setCaptureCode(capture.captureCode);
      setIntent(capture.interpretation.intent);
      setProposedNextStep(capture.interpretation.proposedNextStep);
    } else if (event === null) {
      setCaptureId(null);
      setCaptureCode(null);
      setIntent(null);
      setProposedNextStep(null);
    }
  };

  const reset = () => {
    setProvisionalEvent(null);
    setResolvedComponents([]);
    setCaptureId(null);
    setCaptureCode(null);
    setIntent(null);
    setProposedNextStep(null);
  };

  return (
    <NaturalLanguageContext.Provider
      value={{ captureId, captureCode, provisionalEvent, resolvedComponents, intent, proposedNextStep, setDraft, reset }}
    >
      {children}
    </NaturalLanguageContext.Provider>
  );
}

export function useNaturalLanguageDraft(): NaturalLanguageState {
  const context = useContext(NaturalLanguageContext);
  if (!context) throw new Error("useNaturalLanguageDraft must be used within NaturalLanguageProvider");
  return context;
}
