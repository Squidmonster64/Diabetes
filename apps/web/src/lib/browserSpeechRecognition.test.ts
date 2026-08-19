import { describe, expect, it } from "vitest";
import {
  describeSpeechRecognitionError,
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  joinTranscript,
  type BrowserSpeechRecognitionConstructor,
} from "./browserSpeechRecognition.js";

const FakeRecognition = class {} as unknown as BrowserSpeechRecognitionConstructor;

describe("browser speech-recognition adapter", () => {
  it("accepts standard and WebKit-prefixed browser recognition constructors", () => {
    expect(getSpeechRecognitionConstructor({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(isSpeechRecognitionSupported({ webkitSpeechRecognition: FakeRecognition })).toBe(true);
  });

  it("reports unsupported environments without attempting microphone access", () => {
    expect(getSpeechRecognitionConstructor(null)).toBeNull();
    expect(isSpeechRecognitionSupported(null)).toBe(false);
  });

  it("preserves a readable single-space transcript across final and interim segments", () => {
    expect(joinTranscript("My glucose", " is 8.4 ", "and I ate toast")).toBe("My glucose is 8.4 and I ate toast");
    expect(joinTranscript("", "   ", "two biscuits")).toBe("two biscuits");
  });

  it("maps microphone and recognition failures to recovery instructions", () => {
    expect(describeSpeechRecognitionError("not-allowed")).toContain("permission");
    expect(describeSpeechRecognitionError("network")).toContain("type the description");
    expect(describeSpeechRecognitionError("unknown-engine-error")).toContain("try again");
  });
});
