import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell.js";
import { api, saveDraft, userTimezone } from "../lib/api.js";
import { ApiError } from "../lib/api.js";
import {
  describeSpeechRecognitionError,
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  joinTranscript,
  type BrowserSpeechRecognition,
} from "../lib/speech.js";

export function LogFoodScreen() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [sourceType, setSourceType] = useState<"voice" | "text">("text");
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const finalRef = useRef("");
  const supported = isSpeechRecognitionSupported();

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const startVoice = () => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      setError("Voice entry is not available in this browser. Type the meal instead.");
      return;
    }
    setError(null);
    setSourceType("voice");
    const recognition = new Ctor();
    recognition.lang = "en-AU";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const finals: string[] = [];
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finals.push(transcript);
        else interim = transcript;
      }
      if (finals.length) finalRef.current = joinTranscript(finalRef.current, ...finals);
      setText(joinTranscript(finalRef.current, interim));
    };
    recognition.onerror = (event) => setError(describeSpeechRecognitionError(event.error));
    recognition.onend = () => {
      setListening(false);
      setStatus("Transcription ready. Check it, then parse.");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setStatus("Listening…");
    void api.track("voice_used");
  };

  const stopVoice = () => recognitionRef.current?.stop();

  const parse = async () => {
    const input = text.trim();
    if (!input) {
      setError("Enter or dictate a meal first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      void api.track(sourceType === "voice" ? "voice_used" : "text_used");
      const interpreted = await api.interpret({ text: input, sourceType, timezone: userTimezone() });
      saveDraft({
        ...interpreted,
        mealType: interpreted.inferredMealType,
        timezone: userTimezone(),
        loggedAt: new Date().toISOString(),
        sourceType,
      });
      void api.track("meal_parsed");
      navigate("/confirm");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Parsing failed. Your text is still here — retry or search manually.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Log food">
      <p className="muted">Say or type the whole meal. Example: two bananas and two slices of white bread with 50 grams of butter.</p>
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {status ? <p className="muted">{status}</p> : null}
      <div className="log-hero">
        <button className={`voice-btn${listening ? " recording" : ""}`} type="button" onClick={listening ? stopVoice : startVoice} disabled={!supported && !listening}>
          {listening ? "Stop microphone" : supported ? "Tap microphone" : "Microphone unavailable — type instead"}
        </button>
      </div>
      <div className="field">
        <label htmlFor="meal">What you ate</label>
        <textarea
          id="meal"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSourceType("text");
          }}
          placeholder="Lunch was a chicken salad sandwich, a flat white and an apple"
        />
      </div>
      <button className="btn-primary" type="button" onClick={() => void parse()} disabled={busy}>
        {busy ? "Understanding meal…" : "Parse meal"}
      </button>
      <p className="muted">If parsing fails, your words stay here. You can retry or add foods from search.</p>
    </Shell>
  );
}
