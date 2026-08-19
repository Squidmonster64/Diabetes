import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { segmentEvent } from "@diabetes-companion/natural-language";
import { resolveFoodComponent } from "../lib/foodMatch.js";
import {
  describeSpeechRecognitionError,
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  joinTranscript,
  type BrowserSpeechRecognition,
} from "../lib/browserSpeechRecognition.js";
import { useNaturalLanguageDraft } from "../state/NaturalLanguageContext.js";
import { Screen } from "../components/Screen.js";

const EXAMPLE_TEXT =
  "My blood glucose is 8.4 and I took 4 units of insulin two hours ago. I'm eating a ham sandwich with two slices of white bread and a little butter.";

/**
 * The app's primary entry point: one free-text field describing a whole
 * diabetes event, typed or transcribed by the browser's optional in-app
 * speech-recognition service. The service only writes editable draft text
 * into this field. Submitting only extracts candidate values and searches
 * for possible food matches; nothing is calculated or confirmed until the
 * mandatory review screen.
 */
export function NaturalLanguageEntryScreen() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const transcriptPrefixRef = useRef("");
  const finalTranscriptRef = useRef("");
  const voiceSupported = isSpeechRecognitionSupported();
  const { setDraft } = useNaturalLanguageDraft();
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stopVoiceEntry = () => {
    if (!recognitionRef.current) return;
    setVoiceStatus("Finishing voice entry…");
    recognitionRef.current.stop();
  };

  const startVoiceEntry = () => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setVoiceError("In-app voice entry is not available in this browser. Type your description instead.");
      return;
    }

    setError(null);
    setVoiceError(null);
    setVoiceStatus("Requesting microphone access…");
    transcriptPrefixRef.current = text;
    finalTranscriptRef.current = "";

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = typeof navigator === "undefined" ? "en-AU" : navigator.language || "en-AU";
    recognition.onstart = () => {
      setListening(true);
      setVoiceStatus("Listening. Say what is happening, then push to finish.");
    };
    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalTranscriptRef.current = joinTranscript(finalTranscriptRef.current, transcript);
        else interimTranscript = joinTranscript(interimTranscript, transcript);
      }
      setText(joinTranscript(transcriptPrefixRef.current, finalTranscriptRef.current, interimTranscript));
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") setVoiceError(describeSpeechRecognitionError(event.error));
    };
    recognition.onend = () => {
      setText(joinTranscript(transcriptPrefixRef.current, finalTranscriptRef.current));
      recognitionRef.current = null;
      setListening(false);
      setVoiceStatus("");
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceStatus("");
      setVoiceError("Voice entry could not start. Wait a moment and try again, or type the description instead.");
    }
  };

  const handleSubmit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!text.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const provisionalEvent = segmentEvent(text, Date.now());
      const resolvedComponents = provisionalEvent.meal
        ? await Promise.all(provisionalEvent.meal.components.map((component) => resolveFoodComponent(component)))
        : [];
      setDraft(provisionalEvent, resolvedComponents);
      navigate("/describe/review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process that description.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title="Describe what's happening" showBack={false}>
      <p className="muted">
        Describe your glucose reading, any recent insulin, and what you're eating or drinking - in your own words.
        Use the in-app voice control below or type directly. Nothing in this entry is used until you review it on the next screen.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="event-text">What's happening</label>
          <textarea
            id="event-text"
            rows={6}
            value={text}
            onChange={(changeEvent) => setText(changeEvent.target.value)}
            placeholder={EXAMPLE_TEXT}
          />
        </div>

        <div className="field voice-entry">
          <button
            className={listening ? "voice-entry__button voice-entry__button--finish" : "voice-entry__button voice-entry__button--start"}
            type="button"
            aria-pressed={listening}
            aria-describedby="voice-entry-help"
            onClick={listening ? stopVoiceEntry : startVoiceEntry}
          >
            {listening ? "Push to finish" : "Push to talk"}
          </button>
          <p id="voice-entry-help" className="muted">
            {voiceSupported
              ? "Push once, speak naturally, then push again to finish. Your browser will ask for microphone permission."
              : "In-app voice entry is not supported by this browser. You can still type your description."}
          </p>
          <p className="voice-entry__status" aria-live="polite">{voiceStatus}</p>
          {voiceError ? <div className="banner banner-danger">{voiceError}</div> : null}
        </div>

        {error ? <div className="banner banner-danger">{error}</div> : null}

        <button className="btn-primary" type="submit" disabled={submitting || !text.trim()}>
          {submitting ? "Reading…" : "Continue"}
        </button>
      </form>

      <p className="muted" style={{ marginTop: "1.5rem" }}>
        Nothing is calculated yet - on the next screen you'll review and confirm every value before any
        carbohydrate is calculated.
      </p>

      <div className="field">
        <button className="btn-secondary" type="button" onClick={() => navigate("/food/search")}>
          Search the food database manually instead
        </button>
      </div>
    </Screen>
  );
}
