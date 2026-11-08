import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardCheck, IndianRupee, Receipt, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_LABELS, decideExpense, getCeoDashboard, listExpenses, type CeoDashboard as Dash, type Expense } from "../../lib/data/expenses";
import { presetRange, useLiveRefresh, type RangePreset } from "../../lib/data/reports";
import { Empty, ErrorNotice, Loading, PageHeader, formatDate, formatMoney } from "./common";

const PRESETS: Array<[Exclude<RangePreset, "custom">, string]> = [
  ["last_12_months", "Last 12 months"],
  ["this_fy", "This financial year"],
  ["last_fy", "Last financial year"],
  ["this_month", "This month"],
];

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

/** CEO and Admin home: company-wide people, expenses and travel at a glance. */
export default function CeoDashboard({ name, profileId, isCeo = true }: { name: string; profileId: string; isCeo?: boolean }) {
  const [preset, setPreset] = useState<Exclude<RangePreset, "custom">>("last_12_months");
  const [dash, setDash] = useState<Dash | null>(null);
  const [pending, setPending] = useState<Expense[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const range = presetRange(preset);
    try {
      const [d, p] = await Promise.all([
        getCeoDashboard(range.from, range.to),
        listExpenses({ status: "submitted", limit: 6 }),
      ]);
      setDash(d);
      setPending(p.filter((e) => e.employee_id !== profileId).slice(0, 5));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the dashboard.");
    }
  }, [preset, profileId]);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["expenses", "travel_records", "travel_requests"], load);

  async function approve(e: Expense) {
    setBusy(e.id);
    try {
      await decideExpense(e.id, "approved");
      toast.success(`Approved ${formatMoney(e.amount)} for ${e.employee?.full_name ?? "employee"}`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve.");
    } finally {
      setBusy(null);
    }
  }

  // One tile per job. Details live on the page each tile opens.
  const tiles = dash ? [
    { label: "Total spend", value: formatMoney(Number(dash.expenses.total) + Number(dash.travel.spend)), hint: `Travel ${formatMoney(dash.travel.spend)} · claims ${formatMoney(dash.expenses.total)}`, href: "/travel/bi/finance", icon: <IndianRupee size={16} /> },
    { label: "Travel requests waiting", value: String(dash.pending_travel_requests), hint: "Sent to you and the " + (isCeo ? "Admin" : "CEO"), href: "/travel/approvals", icon: <ClipboardCheck size={16} /> },
    { label: "Claims to review", value: String(dash.expenses.submitted_count), hint: `${formatMoney(dash.expenses.submitted_amount)} · ${formatMoney(dash.expenses.approved_amount)} approved, to pay`, href: "/travel/expenses/all", icon: <Receipt size={16} /> },
    { label: "Employees", value: String(dash.people.active), hint: `${dash.travel.travellers} travelled · ${dash.travel.trips} trips${dash.people.without_login ? ` · ${dash.people.without_login} without sign-in` : ""}`, href: "/travel/people", icon: <UsersRound size={16} /> },
  ] : [];

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow={isCeo ? "CEO DASHBOARD" : "ADMIN DASHBOARD"}
        title={`Good to see you, ${name.split(" ")[0] || (isCeo ? "CEO" : "Admin")}`}
        description="Spend, requests and claims across the company. Updates by itself."
        actions={
          <select aria-label="Date range" value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)} className="button button-ghost">
            {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        }
      />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {!dash && !error ? <Loading /> : dash && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link key={t.label} href={t.href} className="panel p-4 min-w-0 hover:shadow-md transition-shadow block">
                <span className="card-kicker flex items-center gap-1">{t.icon} {t.label}</span>
                <div className="text-2xl font-bold mt-1 truncate" title={t.value}>{t.value}</div>
                <div className="text-xs opacity-70 mt-1 truncate">{t.hint}</div>
              </Link>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <section className="panel p-4 lg:col-span-2 min-w-0">
              <span className="card-kicker">Spend by month</span>
              {dash.by_month.length === 0 ? <Empty title="No spend yet" description="Expenses and trips will show here." /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dash.by_month.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => compact.format(Number(v))} width={48} />
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Legend />
                    <Bar dataKey="expenses" name="Expenses" stackId="s" fill="#F2A93B" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="travel" name="Travel" stackId="s" fill="#2C4250" radius={[3, 3, 0, 0]} className="tx-bar-steel" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">Waiting for your review</span><Link href="/travel/expenses/all" className="text-xs underline">See all</Link></div>
              {pending.length === 0 ? <p className="text-sm opacity-70 mt-3">Nothing waiting. Nice.</p> : (
                <ul className="mt-2 space-y-2">
                  {pending.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{e.employee?.full_name} · {formatMoney(e.amount, e.currency)}</div>
                        <div className="text-xs opacity-70 truncate">{CATEGORY_LABELS[e.category]} · {formatDate(e.expense_date)} · {e.description}</div>
                      </div>
                      <button type="button" className="button button-ghost" disabled={busy === e.id} onClick={() => approve(e)} aria-label={`Approve ${e.description}`}><Check size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-3">
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">Top spenders</span><Link href="/travel/employees" className="text-xs underline">All employees</Link></div>
              {dash.top_spenders.length === 0 ? <p className="text-sm opacity-70 mt-3">No spend in this period.</p> : (
                <div className="responsive-table mt-2">
                  <table>
                    <thead><tr><th>Employee</th><th className="text-right">Travel</th><th className="text-right">Total</th></tr></thead>
                    <tbody>
                      {dash.top_spenders.map((s) => (
                        <tr key={s.employee_id}>
                          <td><Link href={`/travel/employees/${s.employee_id}`} className="font-semibold hover:underline">{s.full_name}</Link><div className="table-subline">{s.department ?? s.employee_code}</div></td>
                          <td className="text-right">{formatMoney(s.travel)}</td>
                          <td className="text-right font-semibold">{formatMoney(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="panel p-4 min-w-0">
              <span className="card-kicker">Departments</span>
              {dash.by_department.length === 0 ? <p className="text-sm opacity-70 mt-3">No departments yet.</p> : (
                <div className="responsive-table mt-2">
                  <table>
                    <thead><tr><th>Department</th><th className="text-right">People</th><th className="text-right">Expenses</th><th className="text-right">Travel</th></tr></thead>
                    <tbody>
                      {dash.by_department.map((d) => (
                        <tr key={d.department}>
                          <td className="font-semibold">{d.department}</td>
                          <td className="text-right">{d.people}</td>
                          <td className="text-right">{formatMoney(d.expenses)}</td>
                          <td className="text-right">{formatMoney(d.travel)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
