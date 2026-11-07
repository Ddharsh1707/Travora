import { useEffect, useState } from "react";
import { Copy, KeyRound, UserRoundCheck } from "lucide-react";
import { createLogin, generateTempPassword, listPeople, updatePerson, type Person } from "../../lib/data/expenses";

/**
 * Employee details and sign-in for the Admin / CEO, on the employee's record.
 * People added from an uploaded Excel or PDF start with only a name and a
 * NEW-… ID; here the Admin fills in the rest and gives them a login, after
 * which the employee sees these same trips when they sign in.
 */
export function EmployeeLoginCard({ profileId, onSaved }: { profileId: string; onSaved?: () => void }) {
  const [person, setPerson] = useState<Person | null>(null);
  const [form, setForm] = useState({ employee_id: "", email: "", department: "", designation: "" });
  const [password, setPassword] = useState(() => generateTempPassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = () => listPeople().then((all) => {
    const p = all.find((x) => x.id === profileId) ?? null;
    setPerson(p);
    if (p) setForm({ employee_id: p.employee_id, email: p.email ?? "", department: p.department ?? "", designation: p.designation ?? "" });
  }).catch(() => setPerson(null));
  useEffect(() => { void load(); }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!person || person.can_manage === false) return null;
  const fromUpload = /^NEW-/i.test(person.employee_id);

  async function save(withLogin: boolean) {
    if (!person) return;
    setBusy(true); setError(""); setDone("");
    try {
      await updatePerson(person.id, { full_name: person.full_name, manager_id: person.manager_id, ...form });
      if (withLogin) {
        await createLogin(person.id, password);
        setDone(`Login created. Send ${person.full_name} the details below. They will see their own trips from the uploaded files when they sign in.`);
      } else {
        setDone("Details saved.");
      }
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const message = `Your Trapple sign-in\nWebsite: ${window.location.origin}/login\nEmail: ${form.email}\nTemporary password: ${password}`;
  const field = (key: keyof typeof form, label: string, type = "text") => (
    <label className="field m-0 grid gap-1 text-xs">
      <span className="opacity-70">{label}</span>
      <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );

  return (
    <section className="panel p-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <UserRoundCheck size={16} />
        <h2 className="section-heading m-0">Employee details and login</h2>
        {fromUpload && <span className="meta-chip">Added from an uploaded file</span>}
        <span className={`status-badge ${person.has_login ? "status-approved" : "status-pending-approval"}`}><span className="status-dot" />{person.has_login ? "Has a login" : "No login yet"}</span>
      </div>
      {!person.has_login && (
        <p className="text-sm opacity-80">
          {fromUpload ? "This person was saved to the employee list from an uploaded Excel or PDF. " : ""}
          Add their email and create a login so they can sign in and see their own travel history and requests.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {field("employee_id", "Employee ID")}
        {field("email", "Email", "email")}
        {field("department", "Department")}
        {field("designation", "Designation")}
      </div>
      {!person.has_login && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="field m-0 grid gap-1 text-xs min-w-[220px]">
            <span className="opacity-70">Temporary password</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="button" className="button button-ghost" onClick={() => setPassword(generateTempPassword())}>New password</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-ghost" disabled={busy} onClick={() => void save(false)}>Save details</button>
        {!person.has_login && (
          <button type="button" className="button button-primary" disabled={busy || !form.email.trim()} onClick={() => void save(true)}>
            <KeyRound size={14} /> Save and create login
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && (
        <div className="grid gap-2 text-sm">
          <p className="text-green-700">{done}</p>
          {done.startsWith("Login") && (
            <div className="flex items-start gap-2">
              <pre className="text-xs p-2 rounded border whitespace-pre-wrap" style={{ borderColor: "var(--line)" }}>{message}</pre>
              <button type="button" className="button button-ghost" onClick={() => void navigator.clipboard?.writeText(message)}><Copy size={14} /> Copy</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
