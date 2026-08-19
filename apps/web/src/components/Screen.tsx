import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export function Screen({
  title,
  showBack = true,
  children,
  className = "",
}: {
  title: string;
  showBack?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <header className="app-header">
        {showBack ? (
          <button className="back-button" type="button" onClick={() => navigate(-1)} aria-label="Back">
            ← Back
          </button>
        ) : null}
        <h1>{title}</h1>
      </header>
      <main className={`screen ${className}`.trim()}>{children}</main>
    </div>
  );
}
