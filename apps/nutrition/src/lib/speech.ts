export interface BrowserSpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

export interface BrowserSpeechRecognitionResultList {
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionResult;
}

export interface BrowserSpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: BrowserSpeechRecognitionResultList;
}

export interface BrowserSpeechRecognitionErrorEvent {
  readonly error: string;
}

export interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

interface SpeechRecognitionWindow {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
}

export function getSpeechRecognitionConstructor(
  target: SpeechRecognitionWindow | null = typeof window === "undefined" ? null : (window as unknown as SpeechRecognitionWindow),
): BrowserSpeechRecognitionConstructor | null {
  return target?.SpeechRecognition ?? target?.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(
  target: SpeechRecognitionWindow | null = typeof window === "undefined" ? null : (window as unknown as SpeechRecognitionWindow),
): boolean {
  return getSpeechRecognitionConstructor(target) !== null;
}

export function joinTranscript(...parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function describeSpeechRecognitionError(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was not granted. Allow microphone access in your browser settings, then try again.";
    case "audio-capture":
      return "No microphone is available. Check your device microphone and try again.";
    case "network":
      return "Speech transcription could not connect. Check your connection or type the description instead.";
    case "no-speech":
      return "No speech was detected. Try again or type the description instead.";
    case "aborted":
      return "Voice entry was stopped. You can start again or edit the text below.";
    default:
      return "Voice entry could not be completed. You can try again or type the description instead.";
  }
}
