/**
 * Trapple wordmark for Mahathi Infra Services: an amber tile with a storage
 * sphere standing on a pipeline (the kind of plant Mahathi builds), the name
 * and a small "Mahathi Infra" line under it. The pipeline gently flows.
 * `light` draws the text for dark backgrounds (sidebar, landing hero);
 * `light={false}` draws it for light backgrounds.
 */
export function Logo({ compact = false, light }: { compact?: boolean; light?: boolean }) {
  return (
    <div
      className={`brand-lockup ${compact ? "brand-lockup-compact" : ""} ${light === true ? "brand-light" : light === false ? "brand-dark" : ""}`}
      aria-label="Trapple by Mahathi Infra Services"
    >
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <rect x="0" y="0" width="40" height="40" rx="9" fill="#F2A93B" />
          <circle cx="20" cy="16" r="7.5" fill="none" stroke="#0F1A22" strokeWidth="3" />
          <path d="M14.5 21.5 L12 29 M25.5 21.5 L28 29" stroke="#0F1A22" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M5 30.5 H35" stroke="#0F1A22" strokeWidth="3" strokeLinecap="round" opacity="0.25" />
          <path className="tx-mark-flow" d="M5 30.5 H35" stroke="#0F1A22" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      </span>
      {!compact && (
        <span className="brand-text">
          <span className="brand-name">TRAPPLE</span>
          <span className="brand-sub">Mahathi Infra</span>
        </span>
      )}
    </div>
  );
}
