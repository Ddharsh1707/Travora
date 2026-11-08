import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MailCheck,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  UserRound,
  XCircle,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "../components/Logo";

const TerminalScene3D = lazy(() => import("../components/TerminalScene3D"));
import { useTheme } from "../contexts/ThemeContext";
import { getResolvedUrl, login as loginApi, persistAuth, type AuthUser } from "../lib/api";
import { isSupabaseEnabled } from "../lib/supabase";
import {
  passwordProblems,
  passwordStrength,
  supabaseResendConfirmation,
  supabaseSignIn,
  supabaseSignUp,
} from "../lib/supabaseAuth";

type Mode = "signin" | "signup" | "check-email";

const ease = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------------------- */
/* Background: a live 3D oil and gas terminal. If WebGL is not available,   */
/* a flat plant drawing with product flowing through the pipes is shown.    */
/* ------------------------------------------------------------------------- */

const ROUTES = [
  "M -40 820 H 420 V 540 H 820",
  "M 80 520 H 260 V 420 H 520 C 640 420, 680 300, 820 300",
  "M -60 220 C 220 120, 520 160, 860 90",
];

const TANKS = [
  { x: 668, y: 470, w: 64, h: 70, level: 0.6 },
  { x: 742, y: 490, w: 52, h: 50, level: 0.35 },
];

function AuthScene() {
  const reduce = useReducedMotion();
  const [flat, setFlat] = useState(false);
  const onFail = useCallback(() => setFlat(true), []);
  if (flat) return <AuthBackdrop />;
  return (
    <motion.div className="auth-scene" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.4, ease }}>
      <Suspense fallback={<AuthBackdrop />}>
        <TerminalScene3D className="auth-scene-canvas" onFail={onFail} reduceMotion={!!reduce} shift={-0.04} />
      </Suspense>
      <div className="auth-scene-shade" />
    </motion.div>
  );
}

function AuthBackdrop() {
  const reduce = useReducedMotion();
  return (
    <div className="auth-backdrop" aria-hidden="true">
      <svg className="auth-routes" viewBox="0 0 820 900" preserveAspectRatio="xMidYMid slice">
        {TANKS.map((t, i) => (
          <g key={i}>
            <motion.rect
              className="auth-tank-fill"
              x={t.x + 2}
              width={t.w - 4}
              initial={{ y: t.y + t.h, height: 0 }}
              animate={{ y: t.y + t.h - t.h * t.level, height: t.h * t.level }}
              transition={{ duration: reduce ? 0 : 2.4, delay: reduce ? 0 : 0.6 + i * 0.3, ease }}
            />
            <rect className="auth-tank" x={t.x} y={t.y} width={t.w} height={t.h} rx="3" />
            <path className="auth-tank" d={`M${t.x} ${t.y} Q${t.x + t.w / 2} ${t.y - 18} ${t.x + t.w} ${t.y}`} />
          </g>
        ))}
        <circle className="auth-tank" cx="735" cy="330" r="38" />
        <path className="auth-tank-line" d="M708 357 L700 420 M762 357 L770 420" />
        {ROUTES.map((d, i) => (
          <g key={d}>
            <path d={d} className="auth-route-base" />
            <motion.path
              d={d}
              className="auth-route-live"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: reduce ? 0 : 2.4, delay: reduce ? 0 : 0.4 + i * 0.35, ease: "easeInOut" }}
            />
            {!reduce && (
              <circle r="3.5" className="auth-route-dot">
                <animateMotion dur={`${10 + i * 4}s`} begin={`${i * 1.5}s`} repeatCount="indefinite" path={d} />
              </circle>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Form pieces                                                                */
/* ------------------------------------------------------------------------- */

function Field({
  label,
  icon,
  children,
  hint,
}: {
  label: string;
  icon: ReactNode;
  children: (id: string) => ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input">
        <span className="auth-input-icon">{icon}</span>
        {children(id)}
      </div>
      {hint}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
      />
      <button
        type="button"
        className="auth-input-action"
        aria-label={show ? "Hide password" : "Show password"}
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </>
  );
}

const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];

function StrengthMeter({ password }: { password: string }) {
  const score = passwordStrength(password);
  const missing = passwordProblems(password);
  if (!password) return <p className="auth-hint">Use 12+ characters with upper and lower case letters and a number.</p>;
  return (
    <div className="auth-strength" aria-live="polite">
      <div className="auth-strength-bars">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className={`auth-strength-bar s${score}`}
            initial={false}
            animate={{ scaleX: i < score ? 1 : 0.0001, opacity: i < score ? 1 : 0.4 }}
            transition={{ duration: 0.35, ease }}
          />
        ))}
      </div>
      <p className="auth-hint">
        <strong className={`s${score}`}>{STRENGTH_LABELS[score]}</strong>
        {missing.length > 0 && <> · needs {missing.join(", ")}</>}
      </p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <motion.div
      role="alert"
      className="auth-error"
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -6, height: 0 }}
      transition={{ duration: 0.25, ease }}
    >
      <XCircle size={15} className="shrink-0" />
      <span>{message}</span>
    </motion.div>
  );
}

function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <motion.button
      type="submit"
      className="auth-submit"
      disabled={loading}
      whileHover={loading ? undefined : { y: -1 }}
      whileTap={loading ? undefined : { scale: 0.985 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.span key="l" className="auth-submit-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <RotateCcw size={16} className="animate-spin" /> {loadingLabel}
          </motion.span>
        ) : (
          <motion.span key="i" className="auth-submit-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            {label} <ArrowRight size={16} className="auth-submit-arrow" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ------------------------------------------------------------------------- */
/* Page                                                                       */
/* ------------------------------------------------------------------------- */

export function LoginPage({
  onAuthenticated,
  onBackToHome,
}: {
  onAuthenticated: (user: AuthUser) => void;
  onBackToHome?: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const reduce = useReducedMotion();
  // Self sign-up is hidden unless VITE_ENABLE_SIGNUP=true is set at build time.
  const canSignUp = isSupabaseEnabled && import.meta.env.VITE_ENABLE_SIGNUP === "true";

  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "signin";
    return canSignUp && new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin";
  });
  const [confirmed] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("confirmed"));

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [slowLoading, setSlowLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    // Legacy backend sleeps when idle; wake it early.
    if (!isSupabaseEnabled) fetch(getResolvedUrl("/api/health")).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) return setSlowLoading(false);
    const t = setTimeout(() => setSlowLoading(true), 3500);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const switchMode = (next: Mode) => {
    setError("");
    setPassword("");
    setConfirmPassword("");
    setMode(next);
  };

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isSupabaseEnabled) {
        onAuthenticated(await supabaseSignIn(email, password));
      } else {
        const data = await loginApi({ username: email.trim(), password });
        persistAuth(data);
        onAuthenticated(data);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg.includes("401") || msg.toLowerCase().includes("unauthorized")
          ? "Invalid username or password. Please check your details."
          : msg || "Unable to sign in. Please check your connection."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await supabaseSignUp({ fullName, email, password, confirmPassword });
      if (result.user) {
        onAuthenticated(result.user);
      } else {
        setPassword("");
        setConfirmPassword("");
        setResendIn(60);
        setMode("check-email");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResendIn(60);
    await supabaseResendConfirmation(email);
    toast.success("Confirmation email sent again.");
  }

  const rise = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease },
  });

  const panel = {
    initial: reduce ? false : { opacity: 0, x: 24, filter: "blur(4px)" },
    animate: { opacity: 1, x: 0, filter: "blur(0px)" },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -24, filter: "blur(4px)" },
    transition: { duration: 0.35, ease },
  } as const;

  const title: Record<Mode, string> = {
    signin: "Welcome back",
    signup: "Create your account",
    "check-email": "Check your inbox",
  };
  const subtitle: Record<Mode, string> = {
    signin: isSupabaseEnabled ? "Sign in with your work email to open your travel workspace." : "Sign in with your employee login to open your travel workspace.",
    signup: "It takes a minute. You'll start with employee access; an admin can add more.",
    "check-email": `We sent a confirmation link to ${email || "your email"}. Click it, then sign in here.`,
  };

  return (
    <div className="auth-page">
      <AuthScene />

      <header className="auth-header">
        <motion.button
          type="button"
          onClick={onBackToHome}
          className="auth-brand"
          title="Back to the Trapple home page"
          {...rise(0)}
        >
          <Logo />
          <span className="auth-brand-org">Oil &amp; gas EPC · Hyderabad</span>
        </motion.button>
        <motion.div className="auth-header-actions" {...rise(0.05)}>
          {onBackToHome && (
            <button type="button" onClick={onBackToHome} className="auth-chip-button">
              <ArrowLeft size={14} /> Website
            </button>
          )}
          <button
            type="button"
            className="auth-icon-button"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            onClick={toggleTheme}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.25 }}
                style={{ display: "grid" }}
              >
                {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              </motion.span>
            </AnimatePresence>
          </button>
        </motion.div>
      </header>

      <main className="auth-layout">
        <section className="auth-story">
          <motion.span className="auth-kicker" {...rise(0.1)}>
            Mahathi Infra Services · Travel desk
          </motion.span>
          <motion.h1 {...rise(0.18)}>
            Site teams move.
            <br />
            Projects keep
            <br />
            <span className="auth-gradient-text">flowing.</span>
          </motion.h1>
          <motion.p {...rise(0.26)}>
            Request a trip to any terminal, port or pipeline site, get one clear decision from the Director and Travel Desk, and keep
            every booking and claim in one place.
          </motion.p>
          <motion.ul className="auth-trust" {...rise(0.34)}>
            {[
              { icon: <ShieldCheck size={14} />, text: "Role-based access" },
              { icon: <RotateCcw size={14} />, text: "Live sync" },
              { icon: <Lock size={14} />, text: "Full audit trail" },
            ].map((t, i) => (
              <motion.li
                key={t.text}
                initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45 + i * 0.08, duration: 0.4, ease }}
                whileHover={reduce ? undefined : { y: -2 }}
              >
                {t.icon} {t.text}
              </motion.li>
            ))}
          </motion.ul>
        </section>

        <motion.section
          className="auth-card"
          initial={reduce ? false : { opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease }}
          aria-labelledby="auth-title"
        >
          {canSignUp && (mode === "signin" || mode === "signup") && (
            <div className="auth-tabs" role="tablist" aria-label="Sign in or create account">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className={mode === m ? "active" : ""}
                  onClick={() => switchMode(m)}
                >
                  {mode === m && <motion.span layoutId="auth-tab-pill" className="auth-tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <span className="auth-tab-label">{m === "signin" ? "Sign in" : "Create account"}</span>
                </button>
              ))}
            </div>
          )}

          <AnimatePresence>
            {confirmed && mode === "signin" && (
              <motion.div className="auth-success" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <CheckCircle2 size={15} /> Email confirmed. You can sign in now.
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div layout={!reduce} transition={{ duration: 0.35, ease }} className="auth-card-body">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} {...panel}>
                <h2 id="auth-title">{title[mode]}</h2>
                <p className="auth-sub">{subtitle[mode]}</p>

                {mode === "signin" && (
                  <form onSubmit={handleSignIn} className="auth-form" noValidate={false}>
                    <Field label={isSupabaseEnabled ? "Work email" : "Username / Login ID"} icon={isSupabaseEnabled ? <Mail size={16} /> : <UserRound size={16} />}>
                      {(id) => (
                        <input
                          id={id}
                          type={isSupabaseEnabled ? "email" : "text"}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete={isSupabaseEnabled ? "email" : "username"}
                          placeholder={isSupabaseEnabled ? "name@company.com" : "e.g. MISPL0001"}
                          required
                        />
                      )}
                    </Field>
                    <Field label="Password" icon={<Lock size={16} />}>
                      {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" placeholder="Your password" />}
                    </Field>
                    <div className="auth-row">
                      <span className="auth-muted">
                        <ShieldCheck size={13} /> Encrypted sign-in
                      </span>
                      <button
                        type="button"
                        className="auth-link"
                        onClick={() => toast("Contact your administrator or IT helpdesk to reset your password.")}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <AnimatePresence>{error && <ErrorBox message={error} />}</AnimatePresence>
                    <SubmitButton loading={loading} label="Sign in" loadingLabel={slowLoading ? "Waking up the server…" : "Signing in…"} />
                    {canSignUp && (
                      <p className="auth-switch">
                        New here?{" "}
                        <button type="button" className="auth-link" onClick={() => switchMode("signup")}>
                          Create an account
                        </button>
                      </p>
                    )}
                  </form>
                )}

                {mode === "signup" && (
                  <form onSubmit={handleSignUp} className="auth-form">
                    <Field label="Full name" icon={<UserRound size={16} />}>
                      {(id) => (
                        <input id={id} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="Arun Kumar" maxLength={120} required />
                      )}
                    </Field>
                    <Field label="Work email" icon={<Mail size={16} />}>
                      {(id) => (
                        <input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@company.com" required />
                      )}
                    </Field>
                    <Field label="Password" icon={<Lock size={16} />} hint={<StrengthMeter password={password} />}>
                      {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" placeholder="Create a password" />}
                    </Field>
                    <Field label="Confirm password" icon={<Lock size={16} />}>
                      {(id) => <PasswordInput id={id} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Type it again" />}
                    </Field>
                    <AnimatePresence>{error && <ErrorBox message={error} />}</AnimatePresence>
                    <SubmitButton loading={loading} label="Create account" loadingLabel="Creating your account…" />
                    <p className="auth-switch">
                      Already have an account?{" "}
                      <button type="button" className="auth-link" onClick={() => switchMode("signin")}>
                        Sign in
                      </button>
                    </p>
                  </form>
                )}

                {mode === "check-email" && (
                  <div className="auth-check">
                    <motion.div
                      className="auth-check-icon"
                      initial={reduce ? false : { scale: 0.4, rotate: -12, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
                    >
                      <MailCheck size={30} />
                    </motion.div>
                    <ol className="auth-steps">
                      <li>Open the email from Trapple (check spam too).</li>
                      <li>Click <strong>Confirm your email</strong>.</li>
                      <li>Come back here and sign in.</li>
                    </ol>
                    <button type="button" className="auth-submit" onClick={() => switchMode("signin")}>
                      <span className="auth-submit-inner">
                        Go to sign in <ArrowRight size={16} />
                      </span>
                    </button>
                    <p className="auth-switch">
                      Didn't get it?{" "}
                      <button type="button" className="auth-link" disabled={resendIn > 0} onClick={resend}>
                        {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend email"}
                      </button>
                    </p>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.section>
      </main>

      <motion.footer className="auth-footer" {...rise(0.6)}>
        <span>© Trapple · Mahathi Infra Services Pvt. Ltd.</span>
        <span>Travel desk support: desk@mahathiinfra.com</span>
      </motion.footer>
    </div>
  );
}
