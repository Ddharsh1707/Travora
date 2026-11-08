import type { ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, Inbox, Loader2, ShieldCheck } from "lucide-react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      <div className="heading-actions flex flex-wrap gap-2 items-center">
        {actions}
        <span className="preview-chip"><ShieldCheck size={13} /> Secure workspace</span>
      </div>
    </div>
  );
}

/** CEO / Admin: one "Employees" menu item with two views. */
export function PeopleTabs({ current }: { current: "manage" | "spend" }) {
  const tab = (key: "manage" | "spend", href: string, label: string) => (
    <Link href={href} className={`button ${current === key ? "button-primary" : "button-ghost"}`} aria-current={current === key ? "page" : undefined}>{label}</Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Employee views">
      {tab("manage", "/travel/people", "Manage & logins")}
      {tab("spend", "/travel/employees", "Spend & history")}
    </nav>
  );
}

export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="panel p-4 min-w-0">
      <span className="card-kicker">{label}</span>
      <div className="text-xl font-bold mt-1 truncate" title={value}>{value}</div>
      {detail && <div className="text-xs opacity-70 mt-1 truncate">{detail}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <Loader2 className="animate-spin" size={22} />
      <p>{label}</p>
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel p-4 flex items-center gap-3 text-sm" role="alert">
      <AlertTriangle size={18} className="text-amber-600 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && <button type="button" className="button button-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Inbox size={20} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatMoney(amount: number | string | null | undefined, currency = "INR"): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  if (currency === "INR") return inr.format(n);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_TONE: Record<string, string> = {
  confirmed: "approved",
  completed: "booked",
  cancelled: "rejected",
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  booked: "booked",
};

export function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "pending";
  return <span className={`approval-pill ${tone}`}>{(status ?? "").replace(/_/g, " ")}</span>;
}

export function labelFor(type: string): string {
  return type === "multi_modal" ? "Multi-modal" : type.charAt(0).toUpperCase() + type.slice(1);
}

/** "HYD → BOM", or just the place for a hotel stay or a cab. */
export function routeLabel(origin: string | null | undefined, destination: string | null | undefined): string {
  if (origin && destination) return `${origin} → ${destination}`;
  return destination || origin || "—";
}
