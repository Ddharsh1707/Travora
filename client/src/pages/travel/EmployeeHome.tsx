import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, FileText, Plane, XCircle } from "lucide-react";
import { Link } from "wouter";
import { useLiveRefresh } from "../../lib/data/reports";
import { getEmployeeHistory, listMyRequests, type TravelRecord, type TravelRequest } from "../../lib/data/travel";
import { ErrorNotice, Loading, PageHeader, formatDate, formatMoney, labelFor, routeLabel } from "./common";
import { RequestDecision, RequestStatusBadge } from "./RequestParts";

/**
 * Employee home. Employees only describe their trips; the Director and Travel Desk
 * decide, and the Travel Desk books. This page shows where each request stands.
 */
export default function EmployeeHome({ name, profileId }: { name: string; profileId: string }) {
  const [requests, setRequests] = useState<TravelRequest[]>([]);
  const [trips, setTrips] = useState<TravelRecord[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        listMyRequests(profileId),
        getEmployeeHistory(profileId).catch(() => [] as TravelRecord[]),
      ]);
      setRequests(r);
      setTrips(t);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your dashboard.");
    } finally {
      setLoaded(true);
    }
  }, [profileId]);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["travel_records", "travel_requests"], load);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(() => trips.filter((t) => t.status !== "cancelled" && t.departure_date >= today).sort((a, b) => a.departure_date.localeCompare(b.departure_date)), [trips, today]);
  const recentTrips = [...trips].sort((a, b) => b.departure_date.localeCompare(a.departure_date)).slice(0, 5);
  const n = (s: string[]) => requests.filter((r) => s.includes(r.status)).length;

  const tiles = [
    { label: "Waiting for approval", value: String(n(["pending"])), hint: "Sent to the Director and Travel Desk", icon: <Clock3 size={16} /> },
    { label: "Approved", value: String(n(["approved", "booked", "completed"])), hint: `${n(["booked"])} booked`, icon: <CheckCircle2 size={16} /> },
    { label: "Rejected", value: String(n(["rejected"])), hint: "Reason shown on each request", icon: <XCircle size={16} /> },
    { label: "Upcoming trips", value: String(upcoming.length), hint: upcoming[0] ? `Next on ${formatDate(upcoming[0].departure_date)}` : "Nothing booked yet", icon: <Plane size={16} /> },
  ];

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="MY DASHBOARD"
        title={`Hello, ${name.split(" ")[0] || "there"}`}
        description="Send your travel details here. The Director and the Travel Desk get your request at the same time, and you see their decision on this page."
        actions={<Link href="/travel/requests" className="button button-primary"><FileText size={15} /> New travel request</Link>}
      />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {!loaded ? <Loading /> : (
        <>
          {upcoming[0] && (
            <Link href="/travel/my" className="panel p-4 flex flex-wrap items-center gap-3 hover:shadow-md transition-shadow">
              <Plane size={20} className="text-teal-600" />
              <div className="min-w-0">
                <span className="card-kicker">Your next trip</span>
                <div className="font-semibold">{routeLabel(upcoming[0].origin, upcoming[0].destination)}</div>
                <div className="text-xs opacity-70">{formatDate(upcoming[0].departure_date)} · {labelFor(upcoming[0].booking_type)}{upcoming[0].booking_reference ? ` · PNR ${upcoming[0].booking_reference}` : ""}</div>
              </div>
              <ArrowRight size={16} className="ml-auto" />
            </Link>
          )}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link key={t.label} href={t.label === "Upcoming trips" ? "/travel/my" : "/travel/requests"} className="panel p-4 min-w-0 hover:shadow-md transition-shadow block">
                <span className="card-kicker flex items-center gap-1">{t.icon} {t.label}</span>
                <div className="text-2xl font-bold mt-1 truncate">{t.value}</div>
                <div className="text-xs opacity-70 mt-1 truncate">{t.hint}</div>
              </Link>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">My latest requests</span><Link href="/travel/requests" className="text-xs underline">All requests</Link></div>
              {requests.length === 0 ? <p className="text-sm opacity-70 mt-3">No requests yet. Use “New travel request” to send your trip details.</p> : (
                <ul className="mt-2 grid gap-3">
                  {requests.slice(0, 4).map((r) => (
                    <li key={r.id} className="border-t pt-2 grid gap-1" style={{ borderColor: "var(--line)" }}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold truncate">{r.origin} → {r.destination}</span>
                        <span className="text-xs opacity-70">{formatDate(r.departure_date)}</span>
                        <span className="ml-auto"><RequestStatusBadge status={r.status} /></span>
                      </div>
                      <RequestDecision r={r} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">My trips</span><Link href="/travel/my" className="text-xs underline">Full history</Link></div>
              {recentTrips.length === 0 ? <p className="text-sm opacity-70 mt-3">No trips booked yet.</p> : (
                <ul className="mt-2 space-y-2">
                  {recentTrips.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{routeLabel(t.origin, t.destination)}</div>
                        <div className="text-xs opacity-70">{formatDate(t.departure_date)} · {labelFor(t.booking_type)}{t.airline_or_provider ? ` · ${t.airline_or_provider}` : ""}</div>
                      </div>
                      <span>{formatMoney(t.amount, t.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
