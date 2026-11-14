import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, FileText, GitMerge, Search, Tag, Undo2, X } from "lucide-react";
import ModalPortal from "../../components/ModalPortal";
import { getDocumentUrl } from "../../lib/data/documents";
import { listContractorNames, listProjects, type Project } from "../../lib/data/imports";
import {
  VERIFICATION_LABELS, WORKFORCE_TYPE_LABELS, addWorkerAlias, getWorker, listWorkers, mergeWorkers, removeWorkerAlias,
  setWorkerActive, setWorkerContractor, setWorkerProject, setWorkerType, unmergeWorkers, verifyWorker,
  type WorkerDetail, type WorkerRow, type WorkforceType,
} from "../../lib/data/workforce";
import { VerificationPill } from "./BiWorkforce";
import { count, dateRange, plural } from "./BiParts";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, StatusPill, formatDate, formatMoney, labelFor, routeLabel } from "./common";

const ALIAS_SOURCE: Record<string, string> = { manual: "Added by hand", import_link: "Linked on an upload", merge: "From a merge" };
const HISTORY_LABEL: Record<string, string> = {
  workforce_type_changed: "Kind of worker changed",
  workforce_verified: "Verified",
  workforce_alias_added: "Spelling added",
  workforce_alias_removed: "Spelling removed",
  workforce_contractor_set: "Contractor changed",
  workforce_project_set: "Project changed",
  workforce_merged: "Merged",
  workforce_unmerged: "Merge undone",
};

/** One worker: who they are, their travel and costs, and what the Travel Desk can change. */
export default function WorkforceDetail({ workerId }: { workerId: string }) {
  const [data, setData] = useState<WorkerDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [merging, setMerging] = useState(false);
  const [, navigate] = useLocation();

  const load = useCallback(() => {
    setError("");
    getWorker(workerId).then(setData).catch((err) => setError(err instanceof Error ? err.message : "Could not load this worker."));
  }, [workerId]);
  useEffect(() => load(), [load]);

  async function act(run: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await run();
      toast.success(done);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(path: string) {
    try {
      window.open(await getDocumentUrl({ storage_path: path }), "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The file could not be opened.");
    }
  }

  if (error) return <div className="page-stack animate-page"><BackLink /><ErrorNotice message={error} onRetry={load} /></div>;
  if (!data) return <Loading label="Loading worker…" />;

  const p = data.person;
  const t = data.totals;
  const cur = data.base_currency;
  const manage = p.can_manage && !p.merged_into;

  return (
    <div className="page-stack animate-page">
      <BackLink />
      <PageHeader
        eyebrow="TEMPORARY WORKFORCE"
        title={p.full_name}
        description={[p.employee_id, WORKFORCE_TYPE_LABELS[p.workforce_type], p.department, p.has_login ? "has a login" : "no login", p.active ? null : "inactive"].filter(Boolean).join(" · ")}
        actions={<VerificationPill status={p.verification_status} />}
      />

      {p.merged_into && (
        <div className="panel p-4 text-sm flex items-center gap-2" role="status">
          <GitMerge size={16} /> This record was merged into <Link href={`/travel/workforce/${p.merged_into}`} className="font-semibold hover:underline">another person</Link>. Their trips and claims are shown there.
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Trips" value={count(t.trips)} detail={t.cancelled_trips ? `${t.cancelled_trips} cancelled, not in spend` : dateRange(t.first_trip, t.last_trip)} />
        <Stat label={`Net travel spend (${cur})`} value={formatMoney(t.net, cur)} detail={Number(t.credits) < 0 ? `${formatMoney(t.gross, cur)} less ${formatMoney(-Number(t.credits), cur)} credits` : "Recorded costs only"} />
        <Stat label="Costs missing" value={count(t.missing_cost_lines)} detail={t.zero_fare_lines ? `${plural(t.zero_fare_lines, "zero fare")} kept` : "Blank costs are never counted as zero"} />
        <Stat label="Contractor · project" value={data.contractor?.name ?? "Unknown"} detail={data.project?.name ?? "No project"} />
      </div>
      {t.other_currencies.length > 0 && (
        <p className="text-xs opacity-70">Also in other currencies, not added to {cur}: {t.other_currencies.map((o) => formatMoney(o.net, o.currency)).join(", ")}.</p>
      )}

      {manage && (
        <ManagePanel data={data} busy={busy} onAct={act} onMerge={() => setMerging(true)} />
      )}

      <section className="panel p-4">
        <h2 className="section-heading inline-flex items-center gap-2"><Tag size={16} /> Other spellings</h2>
        <p className="text-xs opacity-70 mb-2">Uploads with any of these spellings are matched to {p.full_name}.</p>
        {data.aliases.length === 0 ? <p className="text-sm opacity-70">None saved.</p> : (
          <div className="flex flex-wrap gap-2">
            {data.aliases.map((a) => (
              <span key={a.id} className="bi-tag" title={`${ALIAS_SOURCE[a.source] ?? a.source}, ${formatDate(a.created_at)}`}>
                {a.alias}
                {manage && <button type="button" className="icon-button" aria-label={`Remove ${a.alias}`} disabled={busy} onClick={() => void act(() => removeWorkerAlias(a.id), "Spelling removed")}><X size={12} /></button>}
              </span>
            ))}
          </div>
        )}
        {manage && <AliasForm busy={busy} onAdd={(alias) => act(() => addWorkerAlias(p.id, alias), "Spelling saved")} />}
      </section>

      <section className="panel table-panel">
        <div className="table-toolbar"><h2 className="section-heading">Travel history</h2><span className="text-xs">{plural(data.trips.length, "trip")}</span></div>
        {data.trips.length === 0 ? <Empty title="No trips recorded" description="Trips appear here when an upload, a ticket scan or the Travel Desk records them." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>Date</th><th>Route</th><th>Mode</th><th>Booking</th><th>Project</th><th className="text-right">Cost</th><th>Status</th></tr></thead>
              <tbody>
                {data.trips.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDate(r.departure_date)}{r.return_date && <div className="table-subline">to {formatDate(r.return_date)}</div>}</td>
                    <td>{routeLabel(r.origin, r.destination)}<div className="table-subline">{r.source === "import" ? `Upload${r.source_sheet ? ` · ${r.source_sheet}${r.source_row ? ` row ${r.source_row}` : ""}` : ""}` : labelFor(r.source)}</div></td>
                    <td className="text-xs">{labelFor(r.booking_type)}</td>
                    <td className="text-xs">{[r.provider, r.booking_reference].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="text-xs">{r.project_name ?? <span className="opacity-60">Unassigned</span>}</td>
                    <td className="text-right">
                      {r.money.length === 0 ? "—" : r.money.map((m) => (
                        <div key={m.currency} className={r.status === "cancelled" ? "line-through opacity-60" : ""}>
                          {m.missing_lines > 0 && Number(m.gross) === 0 && Number(m.credits) === 0 ? <span className="bi-cost-note">Cost missing</span> : formatMoney(m.net, m.currency)}
                          {Number(m.credits) < 0 && <div className="table-subline">{formatMoney(-Number(m.credits), m.currency)} credit</div>}
                          {m.zero_lines > 0 && <div className="table-subline">zero fare</div>}
                        </div>
                      ))}
                    </td>
                    <td><StatusPill status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.expenses.length > 0 && (
        <section className="panel table-panel">
          <div className="table-toolbar"><h2 className="section-heading">Expense claims</h2></div>
          <div className="responsive-table">
            <table>
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>{data.expenses.map((e) => (
                <tr key={e.id}><td>{formatDate(e.expense_date)}</td><td className="text-xs">{labelFor(e.category)}</td><td className="text-xs">{e.description}</td><td className="text-right">{formatMoney(e.amount, e.currency)}</td><td><StatusPill status={e.status} /></td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel p-4">
        <h2 className="section-heading inline-flex items-center gap-2"><FileText size={16} /> Source documents</h2>
        {data.documents.length === 0 && data.upload_batches.length === 0 ? <p className="text-sm opacity-70">No documents or uploads.</p> : (
          <ul className="text-sm mt-2 space-y-1">
            {data.documents.map((d) => (
              <li key={d.id}>
                <button type="button" className="table-action" onClick={() => void openDocument(d.storage_path)}>{d.original_filename}</button>
                <span className="text-xs opacity-70"> · {labelFor(d.document_type.replace(/_/g, " "))} · {formatDate(d.created_at)}{d.filed_under !== p.id ? " · filed under a merged record" : ""}</span>
              </li>
            ))}
            {data.upload_batches.map((b) => <li key={b}><Link href={`/travel/uploads/${b}`} className="table-action">Upload report</Link><span className="text-xs opacity-70"> · the file these trips came from</span></li>)}
          </ul>
        )}
      </section>

      {(data.merges.length > 0 || data.history.length > 0) && (
        <section className="panel p-4">
          <h2 className="section-heading">Identity history</h2>
          <ul className="text-sm mt-2 space-y-2">
            {data.merges.map((m) => (
              <li key={m.id}>
                <strong>{m.from_name}</strong> merged into <strong>{m.into_name}</strong> on {formatDate(m.merged_at)}. <span className="opacity-70">Reason: {m.evidence}</span>
                {m.reversed_at ? <span className="opacity-70"> · undone {formatDate(m.reversed_at)}</span> : manage || (p.can_manage && m.from_profile === p.id) ? (
                  <button type="button" className="table-action ml-2" disabled={busy}
                    onClick={() => { if (window.confirm(`Undo this merge? ${m.from_name}'s trips, claims and spellings go back to their own record.`)) void act(() => unmergeWorkers(m.id), "Merge undone"); }}>
                    <Undo2 size={13} /> Undo merge
                  </button>
                ) : null}
              </li>
            ))}
            {data.history.filter((h) => h.action !== "workforce_merged" && h.action !== "workforce_unmerged").map((h, i) => (
              <li key={i} className="text-xs opacity-80">{formatDate(h.at)} · {HISTORY_LABEL[h.action] ?? h.action}{typeof h.metadata?.evidence === "string" ? ` · ${h.metadata.evidence}` : ""}</li>
            ))}
          </ul>
        </section>
      )}

      {merging && <MergeDialog worker={data} onClose={() => setMerging(false)} onMerged={(keptId) => { setMerging(false); if (keptId !== p.id) navigate(`/travel/workforce/${keptId}`); else load(); }} />}
    </div>
  );
}

function BackLink() {
  return <Link href="/travel/bi/workforce" className="button button-ghost self-start"><ArrowLeft size={14} /> Temporary Workforce</Link>;
}

function AliasForm({ busy, onAdd }: { busy: boolean; onAdd: (alias: string) => Promise<void> }) {
  const [alias, setAlias] = useState("");
  return (
    <form className="flex flex-wrap gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); if (alias.trim()) void onAdd(alias).then(() => setAlias("")); }}>
      <input aria-label="Other spelling of the name" placeholder="Other spelling, e.g. R Kumar" maxLength={200} value={alias} onChange={(e) => setAlias(e.target.value)} />
      <button type="submit" className="button button-ghost" disabled={busy || !alias.trim()}>Save spelling</button>
    </form>
  );
}

function ManagePanel({ data, busy, onAct, onMerge }: { data: WorkerDetail; busy: boolean; onAct: (run: () => Promise<unknown>, done: string) => Promise<void>; onMerge: () => void }) {
  const p = data.person;
  const [type, setType] = useState<WorkforceType>(p.workforce_type);
  const [contractor, setContractor] = useState(data.contractor?.name ?? "");
  const [project, setProject] = useState(data.project?.id ?? "");
  const [evidence, setEvidence] = useState("");
  const [contractors, setContractors] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    void listContractorNames().then(setContractors);
    void listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);
  const types = (Object.keys(WORKFORCE_TYPE_LABELS) as WorkforceType[]).filter((t) => !p.has_login || t === "permanent_employee");

  return (
    <section className="panel p-4">
      <h2 className="section-heading">Manage this worker</h2>
      <p className="text-xs opacity-70 mb-3">Every change is kept in the audit log. Imported workers never get a login.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="field"><span>Kind of worker</span>
            <select value={type} onChange={(e) => setType(e.target.value as WorkforceType)} disabled={busy}>
              {types.map((t) => <option key={t} value={t}>{WORKFORCE_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <button type="button" className="button button-ghost" disabled={busy || type === p.workforce_type} onClick={() => void onAct(() => setWorkerType(p.id, type), "Kind of worker saved")}>Save</button>
          {p.verification_status !== "verified" && (
            <button type="button" className="button button-primary" disabled={busy} onClick={() => void onAct(() => verifyWorker(p.id), `${p.full_name} is verified`)}><BadgeCheck size={14} /> Verify</button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="field"><span>Contractor / labour supplier</span>
            <input list="workforce-contractors" value={contractor} maxLength={200} placeholder={p.workforce_type === "permanent_employee" ? "Not for permanent employees" : "Leave empty if unknown"}
              disabled={busy || p.workforce_type === "permanent_employee"} onChange={(e) => setContractor(e.target.value)} />
          </label>
          <datalist id="workforce-contractors">{contractors.map((c) => <option key={c} value={c} />)}</datalist>
          <button type="button" className="button button-ghost" disabled={busy || p.workforce_type === "permanent_employee" || contractor.trim() === (data.contractor?.name ?? "")}
            onClick={() => void onAct(() => setWorkerContractor(p.id, contractor), contractor.trim() ? "Contractor saved" : "Contractor cleared")}>Save</button>
        </div>
        <div className="flex flex-wrap gap-2 items-end lg:col-span-2">
          <label className="field"><span>Project</span>
            <select value={project} onChange={(e) => setProject(e.target.value)} disabled={busy}>
              <option value="">No project</option>
              {projects.map((pj) => <option key={pj.id} value={pj.id}>{pj.name}</option>)}
            </select>
          </label>
          <label className="field flex-1 min-w-[16rem]"><span>Why (required for a project)</span>
            <input value={evidence} maxLength={500} placeholder="e.g. Work order WO-17, or the upload's project column" onChange={(e) => setEvidence(e.target.value)} disabled={busy} />
          </label>
          <button type="button" className="button button-ghost" disabled={busy || project === (data.project?.id ?? "")}
            onClick={() => void onAct(() => setWorkerProject(p.id, project || null, evidence), project ? "Project saved" : "Project cleared").then(() => setEvidence(""))}>Save</button>
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="button button-ghost" disabled={busy}
          onClick={() => { if (!p.active || window.confirm(`Mark ${p.full_name} as inactive? Their trips and spend stay in every report.`)) void onAct(() => setWorkerActive(p.id, !p.active), p.active ? "Marked inactive" : "Marked active"); }}>
          {p.active ? "Mark inactive" : "Mark active"}
        </button>
        <button type="button" className="button button-ghost" disabled={busy} onClick={onMerge}><GitMerge size={14} /> Merge with another record…</button>
      </div>
    </section>
  );
}

/** Two records of the same person: pick the other one, pick which to keep, say why. */
function MergeDialog({ worker, onClose, onMerged }: { worker: WorkerDetail; onClose: () => void; onMerged: (keptId: string) => void }) {
  const me = worker.person;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WorkerRow[]>([]);
  const [other, setOther] = useState<WorkerRow | null>(null);
  const [keep, setKeep] = useState<"this" | "other">("this");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(e?: FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    try {
      const r = await listWorkers({ q, include_inactive: true }, 20);
      setResults(r.rows.filter((w) => w.id !== me.id && !w.merged_into));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!other) return;
    const [fromId, intoId] = keep === "this" ? [other.id, me.id] : [me.id, other.id];
    setBusy(true);
    setError("");
    try {
      await mergeWorkers(fromId, intoId, evidence);
      toast.success("Records merged. You can undo this from the identity history.");
      onMerged(intoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge these records.");
    } finally {
      setBusy(false);
    }
  }

  const keptName = keep === "this" ? me.full_name : other?.full_name;
  const goneName = keep === "this" ? other?.full_name : me.full_name;
  return (
    <ModalPortal><div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="merge-title">
      <form className="confirm-dialog max-w-xl w-full text-left max-h-[90vh] overflow-y-auto" onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">MERGE RECORDS</span>
        <h2 id="merge-title">Is {me.full_name} the same person as someone else?</h2>
        <p className="text-sm opacity-80 mt-1">Only merge when you are sure, for example the same ID card or phone number. Similar names alone are not enough. Trips, costs and claims move to the record you keep; nothing is deleted, and the merge can be undone.</p>
        <div className="flex gap-2 mt-4">
          <input className="flex-1" aria-label="Search for the other record" placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(e); }} />
          <button type="button" className="button button-ghost" onClick={() => void search()}><Search size={14} /> Search</button>
        </div>
        {results.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {results.map((w) => (
              <li key={w.id}>
                <label className="flex items-center gap-2">
                  <input type="radio" name="merge-other" checked={other?.id === w.id} onChange={() => setOther(w)} />
                  <span><strong>{w.full_name}</strong> · {w.employee_id} · {WORKFORCE_TYPE_LABELS[w.workforce_type]} · {plural(w.trips, "trip")}{w.has_login ? " · has a login" : ""}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {other && (
          <>
            <fieldset className="mt-4 text-sm">
              <legend className="card-kicker">Which record do you keep?</legend>
              <label className="flex items-center gap-2"><input type="radio" name="merge-keep" checked={keep === "this"} onChange={() => setKeep("this")} /> Keep {me.full_name} ({me.employee_id})</label>
              <label className="flex items-center gap-2"><input type="radio" name="merge-keep" checked={keep === "other"} onChange={() => setKeep("other")} disabled={me.has_login} /> Keep {other.full_name} ({other.employee_id}){me.has_login ? " (not possible: this record has a login)" : ""}</label>
            </fieldset>
            <label className="field mt-3"><span>Why are they the same person?</span>
              <textarea rows={3} maxLength={2000} required value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Same Aadhaar number on both site passes" />
            </label>
            <p className="text-xs opacity-70 mt-2">{goneName} will be merged into {keptName}. {goneName}'s name is saved as another spelling of {keptName}.</p>
          </>
        )}
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || !other || evidence.trim().length < 3}><GitMerge size={14} /> {busy ? "Merging…" : "Merge"}</button>
        </div>
      </form>
    </div></ModalPortal>
  );
}
