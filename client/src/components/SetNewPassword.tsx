import { useEffect, useState, type FormEvent } from "react";
import ModalPortal from "./ModalPortal";
import { OPENED_FROM_PASSWORD_LINK, passwordProblems, supabaseHasLinkSession, supabaseSetNewPassword } from "@/lib/supabaseAuth";

type Stage = "checking" | "form" | "expired" | "done";

/**
 * Shown when someone opens a "Reset password" or invite email link. Without it
 * the link signed the person in but never asked for a new password.
 */
export function SetNewPassword() {
  const [stage, setStage] = useState<Stage | null>(OPENED_FROM_PASSWORD_LINK ? "checking" : null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!OPENED_FROM_PASSWORD_LINK) return;
    let live = true;
    supabaseHasLinkSession().then((ok) => { if (live) setStage(ok ? "form" : "expired"); }, () => { if (live) setStage("expired"); });
    return () => { live = false; };
  }, []);

  if (!stage) return null;

  const close = () => {
    setStage(null);
    window.history.replaceState(null, "", "/login");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setSaving(true);
    const problem = await supabaseSetNewPassword(password);
    setSaving(false);
    if (problem) setError(problem);
    else { setError(null); setStage("done"); }
  };

  const missing = password ? passwordProblems(password) : [];

  return (
    <ModalPortal><div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="new-password-title">
      <form className="confirm-dialog w-full text-left" onSubmit={submit}>
        <span className="card-kicker">ACCOUNT</span>
        <h2 id="new-password-title">{stage === "done" ? "Password changed" : "Set a new password"}</h2>
        {stage === "checking" && <p>Checking your link…</p>}
        {stage === "expired" && <p>This link has expired, was already used, or was opened in a different browser from the one where you asked for it. Choose "Forgot password?" on the sign-in page to get a new one, and open it in the same browser.</p>}
        {stage === "done" && <p>Your new password is saved. Sign in with it now.</p>}
        {stage === "form" && (
          <div className="grid gap-3 mt-4">
            <label className="field"><span>New password</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={128} />
            </label>
            <label className="field"><span>Type it again</span>
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required maxLength={128} />
            </label>
            <p className="text-xs opacity-80">{missing.length ? `Still needs ${missing.join(", ")}.` : "12 or more characters with upper case, lower case and a number."}</p>
            {error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
          </div>
        )}
        <div className="dialog-actions">
          {stage === "form"
            ? <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save new password"}</button>
            : stage !== "checking" && <button type="button" className="button button-primary" onClick={close}>Go to sign in</button>}
        </div>
      </form>
    </div></ModalPortal>
  );
}
