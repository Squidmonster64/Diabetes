import { createContext, useContext, useState, type ReactNode } from "react";
import type { ProvisionalEvent } from "@diabetes-companion/natural-language";
import type { ResolvedFoodComponent } from "../lib/foodMatch.js";

/**
 * Carries a natural-language draft (the parser's ProvisionalEvent plus each
 * food component's resolved match) from the entry screen to the review
 * screen. Nothing here is confirmed - every value is still exactly what the
 * parser and resolver produced, pending explicit user review on the review
 * screen (see NaturalLanguageReviewScreen.tsx).
 */
interface NaturalLanguageState {
  provisionalEvent: ProvisionalEvent | null;
  resolvedComponents: readonly ResolvedFoodComponent[];
  setDraft(event: ProvisionalEvent | null, resolvedComponents: readonly ResolvedFoodComponent[]): void;
  reset(): void;
}

const NaturalLanguageContext = createContext<NaturalLanguageState | undefined>(undefined);

export function NaturalLanguageProvider({ children }: { children: ReactNode }) {
  const [provisionalEvent, setProvisionalEvent] = useState<ProvisionalEvent | null>(null);
  const [resolvedComponents, setResolvedComponents] = useState<readonly ResolvedFoodComponent[]>([]);

  const setDraft = (event: ProvisionalEvent | null, components: readonly ResolvedFoodComponent[]) => {
    setProvisionalEvent(event);
    setResolvedComponents(components);
  };

  const reset = () => {
    setProvisionalEvent(null);
    setResolvedComponents([]);
  };

  return (
    <NaturalLanguageContext.Provider value={{ provisionalEvent, resolvedComponents, setDraft, reset }}>
      {children}
    </NaturalLanguageContext.Provider>
  );
}

export function useNaturalLanguageDraft(): NaturalLanguageState {
  const context = useContext(NaturalLanguageContext);
  if (!context) throw new Error("useNaturalLanguageDraft must be used within NaturalLanguageProvider");
  return context;
}
