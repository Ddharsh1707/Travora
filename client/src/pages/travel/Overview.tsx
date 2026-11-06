import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BarChart3, ClipboardCheck, FileText, Plane, ScanLine, Search, UsersRound } from "lucide-react";
import { Link } from "wouter";
import type { Role } from "../../lib/api";
import { getDashboardCounts, useLiveRefresh, type DashboardCounts } from "../../lib/data/reports";
import { ErrorNotice, Loading, PageHeader, formatDate, labelFor } from "./common";

type Tile = { label: string; value: number | null | undefined; href: string; icon: React.ReactNode; hint: string };

/** Home screen: what needs the user's attention, updated live. */
export default function Overview({ role, name }: { role: Role; name: string }) {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getDashboardCounts().then((c) => { setCounts(c); setError(""); }).catch((err) => setError(err instanceof Error ? err.message : "Could not load your overview."));
  }, []);
  useEffect(load, [load]);
  useLiveRefresh(["travel_records", "travel_requests", "documents", "bulk_bookings"], load);

  const staff = role === "TRAVEL_DESK" || role === "ADMIN";
  const reviewer = role === "APPROVER" || role === "ADMIN";

  const tiles: Tile[] = counts ? [
    { label: "My upcoming trips", value: counts.my_upcoming_trips, href: "/travel/my", icon: <Plane size={16} />, hint: "From today" },
    { label: "My pending requests", value: counts.my_pending_requests, href: "/travel/requests", icon: <FileText size={16} />, hint: "Waiting for approval" },
    ...(reviewer ? [{ label: "Requests to approve", value: counts.approvals_waiting, href: "/travel/approvals", icon: <ClipboardCheck size={16} />, hint: "Assigned to you" }] : []),
    ...(staff ? [
      { label: "Approved, not booked", value: counts.requests_to_book, href: "/travel/search", icon: <Search size={16} />, hint: "Ready to book" },
      { label: "Documents to process", value: counts.documents_to_review, href: "/travel/documents", icon: <ScanLine size={16} />, hint: "Not scanned or not confirmed" },
    ] : []),
    ...(role !== "EMPLOYEE" ? [
      { label: "Group budgets to review", value: counts.bulk_awaiting_review, href: "/travel/bulk", icon: <UsersRound size={16} />, hint: "Bulk bookings" },
      { label: "Trips in the next 7 days", value: counts.trips_next_7_days, href: "/travel/search", icon: <Plane size={16} />, hint: staff ? "Everyone" : "Your team" },
    ] : []),
  ] : [];

  return (
    <div className="page-stack animate-page">
      <PageHeader eyebrow="Overview" title={`Hello, ${name.split(" ")[0] || "there"}`} description="What needs your attention. This page updates by itself when something changes." />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {!counts && !error ? <Loading /> : counts && (
        <>
          {counts.my_next_trip && (
            <Link href="/travel/my" className="panel p-4 flex flex-wrap items-center gap-3 hover:shadow-md transition-shadow">
              <Plane size={20} className="text-teal-600" />
              <div className="min-w-0">
                <span className="card-kicker">Your next trip</span>
                <div className="font-semibold">{counts.my_next_trip.origin} → {counts.my_next_trip.destination}</div>
                <div className="text-xs opacity-70">{formatDate(counts.my_next_trip.departure_date)} · {labelFor(counts.my_next_trip.booking_type)}</div>
              </div>
              <ArrowRight size={16} className="ml-auto" />
            </Link>
          )}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link key={t.label} href={t.href} className="panel p-4 min-w-0 hover:shadow-md transition-shadow block">
                <span className="card-kicker flex items-center gap-1">{t.icon} {t.label}</span>
                <div className="text-2xl font-bold mt-1">{t.value ?? 0}</div>
                <div className="text-xs opacity-70 mt-1 truncate">{t.hint}</div>
              </Link>
            ))}
          </div>
          <Link href="/travel/reports" className="button button-ghost w-fit"><BarChart3 size={15} /> Open reports</Link>
        </>
      )}
    </div>
  );
}
