import type { ReactNode } from "react";

/**
 * Shared mobile result frame. The head and action foot remain visible while
 * only the supporting detail region scrolls, so a person never loses the
 * result they are acting on.
 */
export function ResultLayout({
  title,
  head,
  children,
  footer,
  tone = "default",
}: {
  title: string;
  head: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "refusal" | "settled";
}) {
  return (
    <section className={`result-layout result-layout--${tone}`} aria-label={title}>
      <header className="result-layout__head">{head}</header>
      <div className="result-layout__scroll">{children}</div>
      {footer ? <footer className="result-layout__foot">{footer}</footer> : null}
    </section>
  );
}
