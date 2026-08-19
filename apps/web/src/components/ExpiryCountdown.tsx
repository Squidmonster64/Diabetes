import { useEffect, useMemo, useRef, useState } from "react";

function formatRemaining(ms: number): string {
  const remainingSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Uses the server timestamp captured with the preview instead of trusting the
 * device clock as the source of truth. The server still revalidates on every
 * confirmation; this only keeps the displayed deadline honest between calls.
 */
export function ExpiryCountdown({
  expiresAt,
  serverNow,
  onExpired,
}: {
  expiresAt: string;
  serverNow?: string;
  onExpired?: () => void;
}) {
  const baseline = useRef({
    clientMs: Date.now(),
    serverMs: serverNow ? Date.parse(serverNow) : Date.now(),
  });
  const [tick, setTick] = useState(() => Date.now());
  const expiryMs = useMemo(() => Date.parse(expiresAt), [expiresAt]);

  useEffect(() => {
    baseline.current = { clientMs: Date.now(), serverMs: serverNow ? Date.parse(serverNow) : Date.now() };
    setTick(Date.now());
  }, [expiresAt, serverNow]);

  const estimatedServerNow = baseline.current.serverMs + (tick - baseline.current.clientMs);
  const remainingMs = expiryMs - estimatedServerNow;
  const expired = Number.isNaN(expiryMs) || remainingMs <= 0;

  useEffect(() => {
    if (expired) {
      onExpired?.();
      return;
    }
    const timer = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [expired, onExpired]);

  return (
    <p className="countdown" aria-live="polite" aria-label={expired ? "Preview expired" : `Preview expires in ${formatRemaining(remainingMs)}`}>
      {expired ? "This preview expired" : `Expires in ${formatRemaining(remainingMs)}`}
    </p>
  );
}
