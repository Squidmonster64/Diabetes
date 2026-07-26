import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { segmentEvent } from "@diabetes-companion/natural-language";
import { resolveFoodComponent } from "../lib/foodMatch.js";
import { useNaturalLanguageDraft } from "../state/NaturalLanguageContext.js";
import { Screen } from "../components/Screen.js";

const EXAMPLE_TEXT =
  "My blood glucose is 8.4 and I took 4 units of insulin two hours ago. I'm eating a ham sandwich with two slices of white bread and a little butter.";

/**
 * The app's primary entry point: one free-text field describing a whole
 * diabetes event, typed or dictated with Apple's keyboard Dictation (which
 * inserts recognised text into this field exactly like typed text - there
 * is no microphone API, audio recording, or speech-recognition service
 * here). Submitting only extracts candidate values and searches for
 * possible food matches; nothing is calculated or confirmed until the
 * review screen.
 */
export function NaturalLanguageEntryScreen() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setDraft } = useNaturalLanguageDraft();
  const navigate = useNavigate();

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
        Use your keyboard's dictation button to speak it instead of typing; dictated text works exactly like typed
        text here.
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
