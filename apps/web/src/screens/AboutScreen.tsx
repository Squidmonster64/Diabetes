import { Screen } from "../components/Screen.js";

export function AboutScreen() {
  return (
    <Screen title="About, safety and limitations">
      <div className="banner banner-warning">
        This application is a standalone beta product. It is not approved for clinical treatment use. Natural language
        may help interpret what you said. It must not invent a treatment calculation.
      </div>
      <h3>What this app does</h3>
      <p className="muted">
        Captures your original spoken or typed words, extracts a reviewable draft, and runs a deterministic,
        rule-based bolus calculator preview using values you confirm from your current clinician-approved plan.
        Every result must be explicitly reviewed and confirmed before it is recorded.
      </p>
      <h3>What this app does not do</h3>
      <p className="muted">
        It does not derive or recommend insulin settings, does not use AI or machine learning to calculate a dose,
        does not administer insulin, does not change treatment parameters from a description, and does not replace
        your emergency or hypo plan.
      </p>
      <h3>In an emergency</h3>
      <p className="muted">
        If you are experiencing severe hypoglycaemia, are unconscious, or believe this is an emergency, seek urgent
        assistance or contact local emergency services immediately. Do not rely on this app.
      </p>
    </Screen>
  );
}
