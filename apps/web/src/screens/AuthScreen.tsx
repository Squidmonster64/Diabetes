import { useState } from "react";
import { useAuth } from "../state/AuthContext.js";

export function AuthScreen() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmail(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <main className="screen">
        <h1 style={{ marginTop: "3rem" }}>Diabetes Companion</h1>
        <p className="muted">
          Australian food carbohydrate lookup and a deterministic bolus calculator preview. Not a substitute for
          clinical advice.
        </p>
        {sent ? (
          <div className="banner banner-success">
            Check your email for a sign-in link. You can close this tab once you have followed it.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {error ? <div className="banner banner-danger">{error}</div> : null}
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Sending link…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
