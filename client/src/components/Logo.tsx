/**
 * Trapple wordmark in the Mahathi style: a square navy/orange mark with a
 * flight path, an uppercase name and a small "Travel desk" line under it.
 * `light` draws the text for dark backgrounds (sidebar, landing hero).
 */
export function Logo({ compact = false, light }: { compact?: boolean; light?: boolean }) {
  return (
    <div
      className={`brand-lockup ${compact ? "brand-lockup-compact" : ""} ${light === true ? "brand-light" : light === false ? "brand-dark" : ""}`}
      aria-label="Trapple"
    >
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <rect x="3" y="3" width="34" height="34" fill="currentColor" opacity="0" />
          <path d="M8 30 L20 10 L32 30" fill="none" stroke="#F28C28" strokeWidth="4.5" strokeLinejoin="miter" />
          <rect x="6" y="32" width="28" height="3" fill="currentColor" opacity="0.45" />
          <circle cx="20" cy="10" r="3" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="brand-text">
          <span className="brand-name">TRAPPLE</span>
          <span className="brand-sub">Travel desk</span>
        </span>
      )}
    </div>
  );
}
