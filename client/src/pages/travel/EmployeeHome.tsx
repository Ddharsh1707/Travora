import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Bot, FileText, IndianRupee, Plane, Receipt, ScanLine } from "lucide-react";
import { Link } from "wouter";
import { getDashboardCounts, useLiveRefresh, type DashboardCounts } from "../../lib/data/reports";
import { CATEGORY_LABELS, listExpenses, summarizeExpenses, type Expense } from "../../lib/data/expenses";
import { getEmployeeHistory, type TravelRecord } from "../../lib/data/travel";
import { ErrorNotice, Loading, PageHeader, formatDate, formatMoney, labelFor } from "./common";
import { ExpenseStatusPill } from "./ExpenseStatusPill";

/** Employee home: only the signed-in person's own trips, requests and expenses. */
export default function EmployeeHome({ name, profileId }: { name: string; profileId: string }) {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [trips, setTrips] = useState<TravelRecord[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, e, t] = await Promise.all([
        getDashboardCounts(),
        listExpenses({ employeeId: profileId, limit: 200 }).catch(() => [] as Expense[]),
        getEmployeeHistory(profileId).catch(() => [] as TravelRecord[]),
      ]);
      setCounts(c);
      setExpenses(e);
      setTrips(t);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your dashboard.");
    } finally {
      setLoaded(true);
    }
  }, [profileId]);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["travel_records", "travel_requests", "expenses"], load);

  const totals = useMemo(() => summarizeExpenses(expenses), [expenses]);
  const year = String(new Date().getFullYear());
  const tripsThisYear = trips.filter((t) => t.departure_date.startsWith(year) && t.status !== "cancelled");
  const recentTrips = [...trips].sort((a, b) => b.departure_date.localeCompare(a.departure_date)).slice(0, 5);

  const tiles = [
    { label: "Upcoming trips", value: String(counts?.my_upcoming_trips ?? 0), hint: "From today", href: "/travel/my", icon: <Plane size={16} /> },
    { label: "Requests pending", value: String(counts?.my_pending_requests ?? 0), hint: "Waiting for approval", href: "/travel/requests", icon: <FileText size={16} /> },
    { label: "Expenses in review", value: formatMoney(totals.submitted), hint: `${totals.submittedCount} claim(s)`, href: "/travel/expenses", icon: <Receipt size={16} /> },
    { label: "To be paid to you", value: formatMoney(totals.approved), hint: `${formatMoney(totals.reimbursed)} already reimbursed`, href: "/travel/expenses", icon: <IndianRupee size={16} /> },
  ];

  return (
    <div className="page-stack animate-page">
      <PageHeader eyebrow="MY DASHBOARD" title={`Hello, ${name.split(" ")[0] || "there"}`} description="Your own trips, travel requests and expense claims. Only you and the CEO can see these." />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {!loaded ? <Loading /> : (
        <>
          {counts?.my_next_trip && (
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
                <div className="text-2xl font-bold mt-1 truncate">{t.value}</div>
                <div className="text-xs opacity-70 mt-1 truncate">{t.hint}</div>
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/travel/expenses" className="button button-primary"><Receipt size={15} /> Claim an expense</Link>
            <Link href="/travel/requests" className="button button-ghost"><FileText size={15} /> Request travel</Link>
            <Link href="/travel/documents" className="button button-ghost"><ScanLine size={15} /> Upload a ticket</Link>
            <Link href="/travel/assistant" className="button button-ghost"><Bot size={15} /> Ask the assistant</Link>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">Recent expenses</span><Link href="/travel/expenses" className="text-xs underline">All expenses</Link></div>
              {expenses.length === 0 ? <p className="text-sm opacity-70 mt-3">No expenses yet. Claim cabs, meals, hotels and more with “Claim an expense”.</p> : (
                <ul className="mt-2 space-y-2">
                  {expenses.filter((e) => e.status !== "withdrawn").slice(0, 5).map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{e.description}</div>
                        <div className="text-xs opacity-70">{CATEGORY_LABELS[e.category]} · {formatDate(e.expense_date)}</div>
                      </div>
                      <span className="font-semibold">{formatMoney(e.amount, e.currency)}</span>
                      <ExpenseStatusPill status={e.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">My trips · {tripsThisYear.length} this year</span><Link href="/travel/my" className="text-xs underline">Full history</Link></div>
              {recentTrips.length === 0 ? <p className="text-sm opacity-70 mt-3">No trips recorded yet.</p> : (
                <ul className="mt-2 space-y-2">
                  {recentTrips.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{t.origin} → {t.destination}</div>
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
