import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Bot, Check, ClipboardCheck, FileSpreadsheet, IndianRupee, Plane, Receipt, UserPlus, UsersRound } from "lucide-react";
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
      const [d, p] = await Promise.all([getCeoDashboard(range.from, range.to), listExpenses({ status: "submitted", limit: 6 })]);
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

  const tiles = dash ? [
    { label: "Active employees", value: String(dash.people.active), hint: dash.people.without_login ? `${dash.people.without_login} without a sign-in` : "All can sign in", href: "/travel/people", icon: <UsersRound size={16} /> },
    { label: "Expenses to review", value: String(dash.expenses.submitted_count), hint: formatMoney(dash.expenses.submitted_amount), href: "/travel/expenses/all", icon: <Receipt size={16} /> },
    { label: "Approved, to pay", value: formatMoney(dash.expenses.approved_amount), hint: "Mark as paid in All expenses", href: "/travel/expenses/all", icon: <IndianRupee size={16} /> },
    { label: "Travel requests waiting", value: String(dash.pending_travel_requests), hint: isCeo ? "Pending approval" : "Approved by managers and the CEO", href: isCeo ? "/travel/approvals" : "/travel/search", icon: <ClipboardCheck size={16} /> },
    { label: "Total expenses claimed", value: formatMoney(dash.expenses.total), hint: `${dash.expenses.claims} claims · ${formatMoney(dash.expenses.reimbursed_amount)} paid`, href: "/travel/expenses/all", icon: <Receipt size={16} /> },
    { label: "Travel spend", value: formatMoney(dash.travel.spend), hint: `${dash.travel.trips} trips · ${dash.travel.travellers} travellers`, href: "/travel/reports", icon: <Plane size={16} /> },
    { label: "Upcoming trips", value: String(dash.travel.upcoming), hint: "From today, in range", href: "/travel/search", icon: <Plane size={16} /> },
    { label: "Total company spend", value: formatMoney(Number(dash.expenses.total) + Number(dash.travel.spend)), hint: "Expenses + travel", href: "/travel/reports", icon: <IndianRupee size={16} /> },
  ] : [];

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow={isCeo ? "CEO DASHBOARD" : "ADMIN DASHBOARD"}
        title={`Good to see you, ${name.split(" ")[0] || (isCeo ? "CEO" : "Admin")}`}
        description="Everything across the company: people, expense claims and travel. Updates by itself."
        actions={<>
          <select aria-label="Date range" value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)} className="button button-ghost">
            {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Link href="/travel/assistant" className="button button-ghost"><Bot size={15} /> Ask the assistant</Link>
          <Link href="/travel/import" className="button button-ghost"><FileSpreadsheet size={15} /> Upload travel data</Link>
          <Link href="/travel/people" className="button button-primary"><UserPlus size={15} /> Add employee</Link>
        </>}
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
                    <Bar dataKey="expenses" name="Expenses" stackId="s" fill="#F28C28" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="travel" name="Travel" stackId="s" fill="#1D4E89" radius={[0, 0, 0, 0]} />
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

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="panel p-4 min-w-0">
              <span className="card-kicker">Expenses by category</span>
              {dash.by_category.length === 0 ? <p className="text-sm opacity-70 mt-3">No claims in this period.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(160, dash.by_category.length * 34)}>
                  <BarChart data={dash.by_category.map((c) => ({ ...c, label: CATEGORY_LABELS[c.category] ?? c.category }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" fontSize={11} tickFormatter={(v) => compact.format(Number(v))} />
                    <YAxis type="category" dataKey="label" width={110} fontSize={11} />
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Bar dataKey="amount" name="Amount" fill="#F28C28" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>
            <section className="panel p-4 min-w-0">
              <span className="card-kicker">Top spenders</span>
              {dash.top_spenders.length === 0 ? <p className="text-sm opacity-70 mt-3">No spend in this period.</p> : (
                <div className="responsive-table mt-2">
                  <table>
                    <thead><tr><th>Employee</th><th className="text-right">Expenses</th><th className="text-right">Travel</th><th className="text-right">Total</th></tr></thead>
                    <tbody>
                      {dash.top_spenders.map((s) => (
                        <tr key={s.employee_id}>
                          <td><Link href={`/travel/employees/${s.employee_id}`} className="font-semibold hover:underline">{s.full_name}</Link><div className="table-subline">{s.department ?? s.employee_code}</div></td>
                          <td className="text-right">{formatMoney(s.expenses)}</td>
                          <td className="text-right">{formatMoney(s.travel)}</td>
                          <td className="text-right font-semibold">{formatMoney(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="panel p-4 min-w-0">
            <span className="card-kicker">Departments</span>
            {dash.by_department.length === 0 ? <p className="text-sm opacity-70 mt-3">No departments yet.</p> : (
              <div className="responsive-table mt-2">
                <table>
                  <thead><tr><th>Department</th><th className="text-right">People</th><th className="text-right">Expenses</th><th className="text-right">Travel</th><th className="text-right">Per person</th></tr></thead>
                  <tbody>
                    {dash.by_department.map((d) => (
                      <tr key={d.department}>
                        <td className="font-semibold">{d.department}</td>
                        <td className="text-right">{d.people}</td>
                        <td className="text-right">{formatMoney(d.expenses)}</td>
                        <td className="text-right">{formatMoney(d.travel)}</td>
                        <td className="text-right">{d.people ? formatMoney((Number(d.expenses) + Number(d.travel)) / d.people) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <Link href="/travel/reports" className="button button-ghost">Detailed travel reports <ArrowRight size={14} /></Link>
            <Link href="/travel/search" className="button button-ghost">Search all trips <ArrowRight size={14} /></Link>
          </div>
        </>
      )}
    </div>
  );
}
