import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, RotateCcw, Search, Trash2, UserPlus, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  DB_ROLE_LABELS, createLogin, createPerson, deletePeople, generateTempPassword, listPeople, resetAllData, resetPassword, setActive, setRole, updatePerson,
  type DbRole, type Person, type PersonInput, type ResetScope,
} from "../../lib/data/expenses";
import { useLiveRefresh } from "../../lib/data/reports";
import { exportToCsv } from "../../utils/exportCsv";
import { Empty, ErrorNotice, Loading, PageHeader, PeopleTabs, Stat } from "./common";

const DANGER = { background: "#dc2626", borderColor: "#dc2626", color: "#fff" };

/**
 * Director and Travel Desk: add employees, give them a login, deactivate leavers.
 * The Director and the Travel Desk have the same rights here (roles too)
 * (the database enforces this; can_manage says what to offer).
 */
export default function PeopleManager({ profileId, isCeo }: { profileId: string; isCeo: boolean }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"active" | "inactive" | "nologin" | "all">("active");
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [loginFor, setLoginFor] = useState<Person | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<Person[] | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setPeople(await listPeople());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load employees.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["profiles"], load);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return people.filter((p) =>
      (show === "all" || (show === "active" && p.active) || (show === "inactive" && !p.active) || (show === "nologin" && p.active && !p.has_login)) &&
      (!term || [p.full_name, p.employee_id, p.email, p.department, p.designation].some((v) => (v ?? "").toLowerCase().includes(term))));
  }, [people, q, show]);

  // Nobody deletes themselves or the Director; a Travel Desk member only deletes people they manage.
  const canDelete = useCallback((p: Person) => p.id !== profileId && p.role !== "admin" && (p.can_manage ?? isCeo), [profileId, isCeo]);
  const deletable = useMemo(() => shown.filter(canDelete), [shown, canDelete]);
  const picked = useMemo(() => people.filter((p) => selected.has(p.id) && canDelete(p)), [people, selected, canDelete]);
  const allPicked = deletable.length > 0 && deletable.every((p) => selected.has(p.id));
  function togglePick(id: string) {
    setSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleAll() {
    setSelected((cur) => {
      const next = new Set(cur);
      if (allPicked) deletable.forEach((p) => next.delete(p.id));
      else deletable.forEach((p) => next.add(p.id));
      return next;
    });
  }

  const counts = {
    active: people.filter((p) => p.active).length,
    noLogin: people.filter((p) => p.active && !p.has_login).length,
    inactive: people.filter((p) => !p.active).length,
    managers: people.filter((p) => p.active && p.role !== "employee").length,
  };

  async function changeRole(p: Person, role: DbRole) {
    if (role === p.role) return;
    if (role === "admin" && !window.confirm(`Give ${p.full_name} full Director access to all employees and expenses?`)) return;
    if (role === "company_admin" && !window.confirm(`Make ${p.full_name} a Travel Desk member? They get the same full access as the Director: every employee, expense, upload, role and reset.`)) return;
    try {
      await setRole(p.id, role);
      toast.success(`${p.full_name} is now ${DB_ROLE_LABELS[role]}`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the role.");
    }
  }

  async function toggleActive(p: Person) {
    if (p.active && !window.confirm(`Deactivate ${p.full_name}? They will no longer be able to sign in. Their history is kept.`)) return;
    try {
      await setActive(p.id, !p.active);
      toast.success(p.active ? `${p.full_name} deactivated` : `${p.full_name} activated`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the account status.");
    }
  }

  function exportCsv() {
    exportToCsv("employees", ["Employee ID", "Name", "Email", "Department", "Designation", "Role", "Manager", "Active", "Can sign in"],
      shown.map((p) => [p.employee_id, p.full_name, p.email, p.department, p.designation, DB_ROLE_LABELS[p.role], p.manager_name, p.active ? "yes" : "no", p.has_login ? "yes" : "no"]));
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="Director & Travel Desk"
        title="Employees"
        description={isCeo ? "Add employees, create their sign-in, set their manager and role, and deactivate people who leave." : "Add employees, create their sign-in, set their manager and deactivate people who leave. Only the Director can change roles."}
        actions={<>
          {isCeo && <button type="button" className="button button-ghost table-action-danger" onClick={() => setResetOpen(true)}><RotateCcw size={15} /> Reset data</button>}
          <button type="button" className="button button-ghost" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
          <button type="button" className="button button-primary" onClick={() => setEditing("new")}><UserPlus size={16} /> Add employee</button>
        </>}
      />
      <PeopleTabs current="manage" />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Active employees" value={String(counts.active)} />
        <Stat label="No sign-in yet" value={String(counts.noLogin)} detail="Use “Create login”" />
        <Stat label="Managers & staff" value={String(counts.managers)} detail="Not plain employees" />
        <Stat label="Deactivated" value={String(counts.inactive)} />
      </div>

      <div className="panel p-4 flex flex-wrap gap-2 items-center">
        <div className="search-field flex-1 min-w-[200px] max-w-none"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ID, email or department" aria-label="Search employees" maxLength={80} /></div>
        {([["active", "Active"], ["nologin", "No sign-in"], ["inactive", "Deactivated"], ["all", "All"]] as const).map(([k, label]) => (
          <button key={k} type="button" className={`button ${show === k ? "button-primary" : "button-ghost"}`} onClick={() => setShow(k)}>{label}</button>
        ))}
      </div>

      {picked.length > 0 && (
        <div className="panel p-3 flex flex-wrap items-center gap-2" role="region" aria-label="Selected employees">
          <strong className="text-sm">{picked.length} selected</strong>
          <button type="button" className="button button-ghost" onClick={() => setSelected(new Set())}>Clear</button>
          <button type="button" className="button ml-auto" style={DANGER} onClick={() => setToDelete(picked)}><Trash2 size={15} /> Delete {picked.length === 1 ? "1 employee" : `${picked.length} employees`}</button>
        </div>
      )}

      {error && <ErrorNotice message={error} onRetry={load} />}
      <div className="panel table-panel">
        {loading ? <Loading /> : shown.length === 0 ? <Empty title="No employees found" description="Add an employee, or change the search and filter." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th className="w-8"><input type="checkbox" aria-label="Select all employees shown" checked={allPicked} disabled={!deletable.length} onChange={toggleAll} /></th><th>Employee</th><th>Department</th><th>Manager</th><th>Role</th><th>Sign-in</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shown.map((p) => {
                  const me = p.id === profileId;
                  const manageable = p.can_manage ?? isCeo;
                  return (
                    <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                      <td>{canDelete(p) && <input type="checkbox" aria-label={`Select ${p.full_name}`} checked={selected.has(p.id)} onChange={() => togglePick(p.id)} />}</td>
                      <td>
                        <Link href={`/travel/employees/${p.id}`} className="font-semibold hover:underline">{p.full_name}</Link>{me && <span className="text-xs opacity-60"> (you)</span>}
                        <div className="table-subline">{p.employee_id}{p.email ? ` · ${p.email}` : ""}</div>
                      </td>
                      <td>{p.department ?? "—"}<div className="table-subline">{p.designation ?? ""}</div></td>
                      <td>{p.manager_name ?? "—"}</td>
                      <td>
                        {isCeo ? (
                          <select aria-label={`Role for ${p.full_name}`} value={p.role} disabled={!p.active || me} onChange={(e) => changeRole(p, e.target.value as DbRole)} className="text-sm bg-transparent border rounded-lg px-2 py-1">
                            {(Object.keys(DB_ROLE_LABELS) as DbRole[]).map((r) => <option key={r} value={r}>{DB_ROLE_LABELS[r]}</option>)}
                          </select>
                        ) : <span className="text-sm">{DB_ROLE_LABELS[p.role] ?? p.role}</span>}
                      </td>
                      <td>{!p.active ? <span className="status-badge status-cancelled"><span className="status-dot" />Deactivated</span> : p.has_login ? <span className="status-badge status-approved"><span className="status-dot" />Can sign in</span> : <span className="status-badge status-pending-approval"><span className="status-dot" />No login yet</span>}</td>
                      <td className="whitespace-nowrap"><div className="flex flex-wrap items-center gap-3">
                        {(manageable || me) && <button type="button" className="table-action" onClick={() => setEditing(p)}>Edit</button>}
                        {p.active && !me && manageable && <button type="button" className="table-action" onClick={() => setLoginFor(p)}><KeyRound size={12} className="inline" /> {p.has_login ? "Reset password" : "Create login"}</button>}
                        {!me && manageable && <button type="button" className={`table-action ${p.active ? "table-action-danger" : ""}`} onClick={() => toggleActive(p)}>{p.active ? "Deactivate" : "Activate"}</button>}
                        {canDelete(p) && <button type="button" className="table-action table-action-danger" onClick={() => setToDelete([p])} aria-label={`Delete ${p.full_name}`}><Trash2 size={12} className="inline" /> Delete</button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <PersonDialog
          person={editing === "new" ? null : editing}
          people={people}
          onClose={() => setEditing(null)}
          onSaved={(created) => { setEditing(null); void load(); if (created) setLoginFor(created); }}
        />
      )}
      {loginFor && <LoginDialog person={loginFor} onClose={() => setLoginFor(null)} onDone={() => { void load(); }} />}
      {toDelete && (
        <DeleteDialog
          people={toDelete}
          onClose={() => setToDelete(null)}
          onDone={(ids) => { setToDelete(null); setSelected((cur) => { const next = new Set(cur); ids.forEach((id) => next.delete(id)); return next; }); void load(); }}
        />
      )}
      {resetOpen && <ResetDialog onClose={() => setResetOpen(false)} onDone={() => { setResetOpen(false); setSelected(new Set()); void load(); }} />}
    </div>
  );
}

function PersonDialog({ person, people, onClose, onSaved }: { person: Person | null; people: Person[]; onClose: () => void; onSaved: (created: Person | null) => void }) {
  const [form, setForm] = useState<Record<string, string>>(() => ({
    employee_id: person?.employee_id ?? "",
    full_name: person?.full_name ?? "",
    email: person?.email ?? "",
    department: person?.department ?? "",
    designation: person?.designation ?? "",
    manager_id: person?.manager_id ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const managers = people.filter((p) => p.active && p.id !== person?.id);
  const departments = Array.from(new Set(people.map((p) => p.department).filter(Boolean))) as string[];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, manager_id: form.manager_id || null } as unknown as PersonInput;
      if (person) {
        await updatePerson(person.id, payload);
        toast.success("Employee updated");
        onSaved(null);
      } else {
        const id = await createPerson(payload);
        toast.success("Employee added. Now create their sign-in.");
        onSaved({ id, employee_id: form.employee_id, full_name: form.full_name, email: form.email.toLowerCase(), department: form.department || null,
          designation: form.designation || null, role: "employee", manager_id: form.manager_id || null, manager_name: null, active: true, has_login: false, created_at: "" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the employee.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="person-title">
      <form className="confirm-dialog max-w-xl w-full text-left max-h-[90vh] overflow-y-auto" onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">EMPLOYEE</span>
        <h2 id="person-title">{person ? `Edit ${person.full_name}` : "Add employee"}</h2>
        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <label className="field"><span>Full name</span><input value={form.full_name} onChange={set("full_name")} required maxLength={200} /></label>
          <label className="field"><span>Employee ID</span><input value={form.employee_id} onChange={set("employee_id")} required maxLength={32} placeholder="e.g. EMP042" /></label>
          <label className="field sm:col-span-2"><span>Work email (used to sign in)</span>
            <input type="email" value={form.email} onChange={set("email")} required maxLength={254} disabled={!!person?.has_login} />
            {person?.has_login && <span className="text-xs opacity-70">The email can't change once the employee has a sign-in.</span>}
          </label>
          <label className="field"><span>Department</span><input value={form.department} onChange={set("department")} maxLength={120} list="department-options" /></label>
          <datalist id="department-options">{departments.map((d) => <option key={d} value={d} />)}</datalist>
          <label className="field"><span>Designation</span><input value={form.designation} onChange={set("designation")} maxLength={120} /></label>
          <label className="field sm:col-span-2"><span>Reports to (approves their travel)</span>
            <select value={form.manager_id} onChange={set("manager_id")}>
              <option value="">No manager</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name} ({m.employee_id})</option>)}
            </select>
          </label>
        </div>
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : person ? "Save changes" : "Add employee"}</button>
        </div>
      </form>
    </div>
  );
}

function LoginDialog({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState(() => generateTempPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const reset = person.has_login;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (reset) await resetPassword(person.id, password);
      else await createLogin(person.id, password);
      setDone(true);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the password.");
    } finally {
      setSaving(false);
    }
  }

  const message = `Your Trapple sign-in\nWebsite: ${window.location.origin}/login\nEmail: ${person.email ?? ""}\nTemporary password: ${password}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Copied. Send it to the employee privately.");
    } catch {
      toast.error("Could not copy. Select the text and copy it yourself.");
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <form className="confirm-dialog max-w-md w-full text-left" onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">{reset ? "RESET PASSWORD" : "CREATE LOGIN"}</span>
        <h2 id="login-title">{person.full_name}</h2>
        {!person.email ? <p className="text-sm mt-3">Add a work email for this employee first (Edit).</p> : done ? (
          <>
            <p className="text-sm mt-3">{reset ? "The password was changed." : "The login is ready."} Send these details to {person.full_name.split(" ")[0]} privately. The password is not shown again.</p>
            <pre className="panel p-3 mt-3 text-xs whitespace-pre-wrap select-all">{message}</pre>
            <div className="dialog-actions">
              <button type="button" className="button button-ghost" onClick={copy}><Copy size={14} /> Copy</button>
              <button type="button" className="button button-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm mt-3 opacity-80">They sign in with <strong>{person.email}</strong> and this temporary password. They can change it later with "Forgot password".</p>
            <label className="field mt-3"><span>Temporary password</span>
              <div className="flex gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} maxLength={72} className="flex-1 font-mono" autoComplete="off" />
                <button type="button" className="button button-ghost" onClick={() => setPassword(generateTempPassword())}>New</button>
              </div>
              <span className="text-xs opacity-70">12+ characters with upper case, lower case and a number.</span>
            </label>
            {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : reset ? "Set new password" : "Create login"}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/** Confirms a permanent delete. Several people need the word DELETE typed. */
function DeleteDialog({ people, onClose, onDone }: { people: Person[]; onClose: () => void; onDone: (ids: string[]) => void }) {
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const many = people.length > 1;
  const ready = !many || typed.trim().toUpperCase() === "DELETE";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError("");
    try {
      const n = await deletePeople(people.map((p) => p.id));
      toast.success(n === 1 ? `${people[0].full_name} was deleted` : `${n} employees were deleted`);
      onDone(people.map((p) => p.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <form className="confirm-dialog max-w-md w-full text-left" onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">DELETE FOR GOOD</span>
        <h2 id="delete-title">{many ? `Delete ${people.length} employees?` : `Delete ${people[0].full_name}?`}</h2>
        <p className="text-sm mt-3">This removes {many ? "these employees" : "this employee"} with every trip, travel request, expense claim, document and sign-in. It can't be undone.</p>
        <p className="text-sm mt-2 opacity-80">To keep their history for reports, use <strong>Deactivate</strong> instead.</p>
        {many && (
          <>
            <ul className="text-sm mt-3 max-h-32 overflow-y-auto list-disc pl-5">
              {people.slice(0, 50).map((p) => <li key={p.id}>{p.full_name} <span className="opacity-60">({p.employee_id})</span></li>)}
              {people.length > 50 && <li className="opacity-60">and {people.length - 50} more</li>}
            </ul>
            <label className="field mt-3"><span>Type DELETE to confirm</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
            </label>
          </>
        )}
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button" style={DANGER} disabled={saving || !ready}>{saving ? "Deleting…" : "Delete"}</button>
        </div>
      </form>
    </div>
  );
}

/** CEO only: clears company data after the word RESET is typed. */
function ResetDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [scope, setScope] = useState<ResetScope>("data");
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ready = typed.trim() === "RESET";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError("");
    try {
      const r = await resetAllData(scope, typed.trim());
      toast.success(scope === "everything" ? `Reset done. ${r.trips} trips and ${r.people} employees removed.` : `Reset done. ${r.trips} trips removed; employees kept.`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <form className="confirm-dialog max-w-lg w-full text-left" onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">RESET DATA</span>
        <h2 id="reset-title">Start again with empty data?</h2>
        <p className="text-sm mt-3">This deletes every trip, travel request, expense claim, uploaded Excel / PDF, document, project and assistant chat for the whole company. It can't be undone.</p>
        <fieldset className="mt-3 space-y-2 text-sm">
          <legend className="sr-only">What to reset</legend>
          <label className="flex items-start gap-2"><input type="radio" name="reset-scope" checked={scope === "data"} onChange={() => setScope("data")} className="mt-1" />
            <span><strong>Data only.</strong> Keep every employee and their sign-in.</span></label>
          <label className="flex items-start gap-2"><input type="radio" name="reset-scope" checked={scope === "everything"} onChange={() => setScope("everything")} className="mt-1" />
            <span><strong>Data and employees.</strong> Also delete every employee and sign-in, except the Director and Travel Desk.</span></label>
        </fieldset>
        <label className="field mt-3"><span>Type RESET to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button" style={DANGER} disabled={saving || !ready}>{saving ? "Resetting…" : "Reset data"}</button>
        </div>
      </form>
    </div>
  );
}
