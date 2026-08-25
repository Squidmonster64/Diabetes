/**
 * Server-side OpenAI client shared by Diabetes and Nutrition.
 *
 * Mirrors Fragments (`Squidmonster64/fragments` `app/transcription.py`):
 * - `OPENAI_API_KEY` stays on the server
 * - HTTPS to api.openai.com
 * - no official SDK (Fragments uses `requests`; this uses `fetch`)
 * - transcription default `gpt-4o-transcribe` with `whisper-1` fallback
 * - failure logs status + model + truncated detail, never the key
 *
 * Fragments does not call Chat Completions. Structured JSON interpretation
 * uses the same key, host, and logging policy with `gpt-4o-mini` unless
 * `OPENAI_INTERPRETATION_MODEL` is set.
 */
import {
  DEFAULT_INTERPRETATION_MODEL,
  DEFAULT_TRANSCRIPTION_MODEL,
  DEFAULT_TRANSCRIPTION_PROVIDER,
  INTERPRETATION_TIMEOUT_MS,
  OPENAI_CHAT_COMPLETIONS_URL,
  OPENAI_TRANSCRIPTIONS_URL,
  TRANSCRIPTION_FALLBACK_MODEL,
  TRANSCRIPTION_TIMEOUT_MS,
} from "./versions.js";

export interface AiLogger {
  warn(payload: Record<string, unknown>, message: string): void;
}

export class OpenAiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiConfigurationError";
  }
}

export class OpenAiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiProviderError";
  }
}

export interface OpenAiRuntimeConfig {
  readonly apiKey: string;
  readonly interpretationModel: string;
  readonly transcriptionModel: string;
  readonly transcriptionProvider: string;
  readonly logger?: AiLogger;
}

function silentLogger(): AiLogger {
  return { warn() {} };
}

function truncateDetail(value: string): string {
  return value.replace(/\n/g, " ").slice(0, 220);
}

function jsonErrorDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message.trim();
  }
  if (typeof record.message === "string") return record.message.trim();
  return "";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new OpenAiProviderError(
      aborted ? "The language service timed out." : "The language service could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }
}

function requiresWhisperFallback(status: number, detail: string, requestedModel: string): boolean {
  if (requestedModel === TRANSCRIPTION_FALLBACK_MODEL || (status !== 400 && status !== 404)) return false;
  const wording = detail.toLowerCase();
  return wording.includes("whisper-1") && (wording.includes("only") || wording.includes("supported") || wording.includes("model"));
}

export function resolveOpenAiRuntime(input: {
  readonly apiKey?: string;
  readonly interpretationModel?: string;
  readonly transcriptionModel?: string;
  readonly transcriptionProvider?: string;
  readonly logger?: AiLogger;
}): OpenAiRuntimeConfig | null {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) return null;
  const provider = (input.transcriptionProvider ?? DEFAULT_TRANSCRIPTION_PROVIDER).trim().toLowerCase() || DEFAULT_TRANSCRIPTION_PROVIDER;
  if (provider !== "openai") {
    throw new OpenAiConfigurationError(`The selected transcription provider (${provider}) is not available yet.`);
  }
  return {
    apiKey,
    interpretationModel: input.interpretationModel?.trim() || DEFAULT_INTERPRETATION_MODEL,
    transcriptionModel: input.transcriptionModel?.trim() || DEFAULT_TRANSCRIPTION_MODEL,
    transcriptionProvider: provider,
    logger: input.logger,
  };
}

export interface StructuredCompletion {
  readonly model: string;
  readonly content: unknown;
}

export async function completeJsonSchema(options: {
  readonly runtime: OpenAiRuntimeConfig;
  readonly schemaName: string;
  readonly schema: Record<string, unknown>;
  readonly systemPrompt: string;
  readonly userText: string;
  readonly model?: string;
}): Promise<StructuredCompletion | null> {
  const logger = options.runtime.logger ?? silentLogger();
  const model = options.model?.trim() || options.runtime.interpretationModel;
  const response = await fetchWithTimeout(
    OPENAI_CHAT_COMPLETIONS_URL,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.runtime.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: { name: options.schemaName, strict: true, schema: options.schema },
        },
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userText },
        ],
      }),
    },
    INTERPRETATION_TIMEOUT_MS,
  );

  if (!response.ok) {
    let detail = "";
    try {
      detail = jsonErrorDetail(await response.json());
    } catch {
      detail = "";
    }
    logger.warn(
      {
        status: response.status,
        model,
        detail: truncateDetail(detail) || "(no JSON error detail)",
        stage: "openai_chat_completions",
      },
      "Language interpretation request failed",
    );
    return null;
  }

  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return { model: body.model ?? model, content: JSON.parse(content) as unknown };
  } catch {
    return null;
  }
}

export interface TranscriptionResult {
  readonly text: string;
  readonly provider: string;
  readonly model: string;
}

export async function transcribeFinishedRecording(options: {
  readonly runtime: OpenAiRuntimeConfig;
  readonly audio: Blob;
  readonly fileName: string;
  readonly mimeType: string;
  readonly hint?: string;
}): Promise<TranscriptionResult> {
  const logger = options.runtime.logger ?? silentLogger();
  const hint = (options.hint ?? "").slice(0, 1_000);

  const send = async (model: string): Promise<{ response: Response; model: string }> => {
    const form = new FormData();
    form.set("model", model);
    form.set("response_format", "json");
    form.set("language", "en");
    form.set("prompt", hint);
    form.set("file", options.audio, options.fileName);
    const response = await fetchWithTimeout(
      OPENAI_TRANSCRIPTIONS_URL,
      {
        method: "POST",
        headers: { authorization: `Bearer ${options.runtime.apiKey}` },
        body: form,
      },
      TRANSCRIPTION_TIMEOUT_MS,
    );
    return { response, model };
  };

  let selectedModel = options.runtime.transcriptionModel;
  let { response, model } = await send(selectedModel);
  let detail = "";
  try {
    if (!response.ok) detail = jsonErrorDetail(await response.clone().json());
  } catch {
    detail = "";
  }
  if (requiresWhisperFallback(response.status, detail, selectedModel)) {
    selectedModel = TRANSCRIPTION_FALLBACK_MODEL;
    ({ response, model } = await send(selectedModel));
    try {
      detail = response.ok ? "" : jsonErrorDetail(await response.clone().json());
    } catch {
      detail = "";
    }
  }
  if (!response.ok) {
    logger.warn(
      {
        status: response.status,
        model,
        detail: truncateDetail(detail) || "(no JSON error detail)",
        stage: "openai_transcriptions",
      },
      "Finished-recording transcription failed",
    );
    throw new OpenAiProviderError(
      `The transcription service could not finish this recording${detail ? `: ${truncateDetail(detail)}` : "."}`,
    );
  }
  const payload = (await response.json()) as { text?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    throw new OpenAiProviderError("No words were returned for this recording. You can still type the words yourself.");
  }
  return { text, provider: options.runtime.transcriptionProvider, model };
}

export { requiresWhisperFallback };
