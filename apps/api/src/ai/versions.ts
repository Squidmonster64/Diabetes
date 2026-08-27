/**
 * Shared interpretation versions. Fragments uses the same OpenAI account
 * (`OPENAI_API_KEY`) and the same audio model default. Chat structured
 * output cannot use `gpt-4o-transcribe`; that model is audio-only.
 */
export const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

/** Fragments default. Override with OPENAI_TRANSCRIPTION_MODEL. */
export const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
/** Fragments fallback when a gateway only exposes Whisper. */
export const TRANSCRIPTION_FALLBACK_MODEL = "whisper-1";
export const DEFAULT_TRANSCRIPTION_PROVIDER = "openai";

/**
 * Chat model for schema-validated language interpretation.
 * Fragments has no chat model; this repo already uses gpt-4o-mini and the
 * Diabetes regression suite is the CI path (deterministic, no live key).
 */
export const DEFAULT_INTERPRETATION_MODEL = "gpt-4o-mini";

export const NUTRITION_MEAL_SCHEMA_NAME = "parsed_meal";
export const NUTRITION_MEAL_PROMPT_VERSION = "meal-parse-v1";

export const DIABETES_EVENT_SCHEMA_NAME = "diabetes_language_event";
export const DIABETES_EVENT_PROMPT_VERSION = "diabetes-event-v3";

export const INTERPRETATION_TIMEOUT_MS = 30_000;
export const TRANSCRIPTION_TIMEOUT_MS = 120_000;
