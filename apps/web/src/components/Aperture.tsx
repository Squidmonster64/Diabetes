import { ExpiryCountdown } from "./ExpiryCountdown.js";

export function Aperture({
  roundedTotalUnits,
  expiresAt,
  serverNow,
  onExpired,
}: {
  roundedTotalUnits: string;
  expiresAt: string;
  serverNow?: string;
  onExpired?: () => void;
}) {
  return (
    <div className="aperture" aria-label={`Calculated dose ${roundedTotalUnits} units`}>
      <p className="aperture__eyebrow">Dose preview</p>
      <p className="dose-display">
        {roundedTotalUnits} <span aria-hidden="true">U</span>
      </p>
      <p className="dose-unit">rapid-acting insulin</p>
      <div className="aperture__countdown">
        <ExpiryCountdown expiresAt={expiresAt} serverNow={serverNow} onExpired={onExpired} />
      </div>
    </div>
  );
}

export function RefusalAperture({ userFacingMessage }: { userFacingMessage: string }) {
  return (
    <div className="aperture" aria-label="Calculation unavailable">
      <p className="aperture__eyebrow">Calculation unavailable</p>
      <p className="aperture__refusal">{userFacingMessage}</p>
    </div>
  );
}
