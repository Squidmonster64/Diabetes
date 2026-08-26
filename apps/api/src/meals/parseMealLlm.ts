/**
 * Optional language-model overlay for meal parsing.
 * Implementation lives in the shared AI interpretation layer (`src/ai`).
 */
export {
  chooseMealParse,
  overlayLanguageModelMealParse,
  parseMealWithLanguageModel,
} from "../ai/interpretLanguage.js";
