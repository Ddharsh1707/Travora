import { Plane } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? "brand-lockup-compact" : ""}`} aria-label="Trapple">
      <span className="brand-mark"><Plane size={16} strokeWidth={2.4} /></span>
      {!compact && <span className="brand-name">trapple</span>}
    </div>
  );
}
