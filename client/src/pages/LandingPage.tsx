import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  FolderKanban,
  KeyRound,
  Lock,
  Menu,
  Plane,
  Receipt,
  ScrollText,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";

// The 3D intro is loaded on its own so the rest of the page paints first.
const TerminalScene3D = lazy(() => import("@/components/TerminalScene3D"));

/*
 * Public landing page in the Mahathi energy theme. Mahathi Infra Services
 * builds oil terminals, tank farms, pipelines, LPG spheres and fire
 * protection systems, so the page is drawn like a plant schematic: graphite
 * surfaces, a drawing-sheet grid, safety-amber highlights and product flowing
 * through pipes. Company facts here come from public company records only.
 */

interface LandingPageProps {
  onSignIn: () => void;
}

const ease = [0.16, 1, 0.3, 1] as const;
const container = "mx-auto w-full max-w-[86rem] px-5 sm:px-8 lg:px-12";

const NAV = [
  { id: "platform", label: "Platform" },
  { id: "workflow", label: "Workflow" },
  { id: "portals", label: "Portals" },
  { id: "security", label: "Security" },
];

const CAPABILITIES = [
  "Oil terminals",
  "Storage tank farms",
  "Pipelines",
  "LPG spheres & bullets",
  "Fire protection systems",
  "Project planning & commissioning",
  "Civil design & soil survey",
];

const FEATURES = [
  { icon: Plane, title: "Travel requests", text: "Engineers describe the trip once: route, dates, project and hotel. The CEO and the Admin get it at the same moment." },
  { icon: ClipboardCheck, title: "One decision, seen by all", text: "Approve or reject with a note. The employee sees who decided and why, right on their dashboard." },
  { icon: FileSpreadsheet, title: "Excel & PDF uploads", text: "Drop in the travel desk workbook or booking PDFs. Every row is checked and previewed before it is saved." },
  { icon: Receipt, title: "Expense claims", text: "Cabs, site lodges and meals with receipts attached, reviewed and marked as paid in one queue." },
  { icon: FolderKanban, title: "Project intelligence", text: "Spend and travel grouped by project straight from the sheet, with a team report for every site." },
  { icon: Bot, title: "AI assistant", text: "Ask in plain words: who travelled to Paradip last quarter, or what a project has spent on travel." },
];

const STEPS = [
  { code: "01", title: "Request", text: "An employee raises the trip with route, dates, purpose and project." },
  { code: "02", title: "Decide", text: "The CEO and Admin see it together. One decision, with a reason." },
  { code: "03", title: "Book", text: "The Admin books, uploads tickets and keeps bulk site moves on one sheet." },
  { code: "04", title: "Report", text: "Spend lands in project, travel and finance reports, ready to download." },
];

const PORTALS = [
  {
    tag: "Employee",
    title: "Employee portal",
    points: ["Send a travel request in a minute", "See the decision and the reason", "Your upcoming trips and history", "Claim expenses with receipts"],
  },
  {
    tag: "Admin",
    title: "Admin portal",
    points: ["Decide travel requests", "Upload Excel and PDF bookings", "Bulk bookings for site teams", "Employees, logins and claims"],
    featured: true,
  },
  {
    tag: "CEO",
    title: "CEO portal",
    points: ["Company spend on one screen", "Approve requests and claims", "Project, travel and finance reports", "Ask the AI assistant"],
  },
];

const SECURITY = [
  { icon: ShieldCheck, title: "Role-based access", text: "Every read and write is checked again by the database, not only by the screen." },
  { icon: Lock, title: "Private file storage", text: "Tickets, invoices and uploads stay in private storage, opened through short-lived links." },
  { icon: ScrollText, title: "Full audit trail", text: "Approvals, uploads, downloads and changes are logged with who did them and when." },
  { icon: KeyRound, title: "Company sign-in", text: "Work email logins created by the CEO or Admin. No public sign-ups." },
];

/* ------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* ------------------------------------------------------------------------- */

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 72;
  window.scrollTo({ top, behavior: "smooth" });
}

function Reveal({ children, delay = 0, className = "", y = 28 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduce ? 0.3 : 0.9, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Each word slides up from behind a mask. */
function WordReveal({ lines, className = "", delay = 0, gradientLast = false, onLoad = false }: { lines: string[]; className?: string; delay?: number; gradientLast?: boolean; onLoad?: boolean }) {
  const reduce = useReducedMotion();
  let i = 0;
  const trigger = onLoad ? { initial: "hidden", animate: "show" } : { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.5 } };
  return (
    <motion.span className={`block ${className}`} aria-label={lines.join(" ")} {...trigger}>
      {lines.map((line, li) => (
        <span key={li} className="block" aria-hidden="true">
          {line.split(" ").map((w, wi, arr) => {
            const n = i++;
            return (
              <span key={wi} className="inline-block overflow-hidden pb-[0.1em] align-bottom">
                <motion.span
                  className={`inline-block ${gradientLast && li === lines.length - 1 ? "lp-gradient-text" : ""}`}
                  variants={{
                    hidden: { y: reduce ? 0 : "110%", opacity: reduce ? 0 : 1 },
                    show: { y: "0%", opacity: 1, transition: { duration: reduce ? 0.3 : 1, ease, delay: delay + n * 0.055 } },
                  }}
                >
                  {w}
                  {wi < arr.length - 1 ? " " : ""}
                </motion.span>
              </span>
            );
          })}
        </span>
      ))}
    </motion.span>
  );
}

function Kicker({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={`lp-mono inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.2em] ${dark ? "text-[#F2A93B]" : "text-[#8A520B]"}`}>
      <span className="h-2 w-2 bg-[#F2A93B] [clip-path:polygon(0_0,100%_50%,0_100%)]" />
      {children}
    </p>
  );
}

function SectionHeader({ kicker, title, intro, dark = false }: { kicker: string; title: string[]; intro?: string; dark?: boolean }) {
  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
      <div className="lg:col-span-7">
        <Reveal><Kicker dark={dark}>{kicker}</Kicker></Reveal>
        <h2 className={`lp-display mt-6 text-[clamp(2.2rem,4.6vw,4.2rem)] font-extrabold ${dark ? "text-white" : "text-[#0F1A22]"}`}>
          <WordReveal lines={title} />
        </h2>
      </div>
      {intro && (
        <Reveal delay={0.15} className="lg:col-span-4 lg:col-start-9">
          <p className={`text-base leading-relaxed md:text-lg ${dark ? "text-white/65" : "text-[#56656F]"}`}>{intro}</p>
        </Reveal>
      )}
    </div>
  );
}

function PrimaryButton({ children, onClick, className = "" }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`lp-btn group inline-flex items-center gap-3 rounded-[10px] bg-[#F2A93B] px-6 py-3.5 text-[14px] font-bold text-[#0F1A22] shadow-[0_14px_30px_-14px_rgba(242,169,59,0.95)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4B248] ${className}`}
      style={{ fontFamily: "var(--font-heading)" }}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </button>
  );
}

function GhostButton({ children, onClick, dark = true }: { children: ReactNode; onClick?: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-[10px] border px-6 py-3.5 text-[14px] font-semibold transition-all duration-300 hover:-translate-y-0.5 ${
        dark ? "border-white/20 text-white hover:border-[#F2A93B] hover:text-[#F2A93B]" : "border-[#CBD1CB] text-[#0F1A22] hover:border-[#0F1A22]"
      }`}
      style={{ fontFamily: "var(--font-heading)" }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* Hero schematic: a small terminal with tanks, a sphere and flowing pipes,   */
/* plus a travel route from Hyderabad to a site.                              */
/* ------------------------------------------------------------------------- */

function Tank({ x, y, w, h, level, delay, label }: { x: number; y: number; w: number; h: number; level: number; delay: number; label: string }) {
  const reduce = useReducedMotion();
  const fillH = h * level;
  return (
    <g>
      <motion.rect
        x={x + 2}
        width={w - 4}
        fill="rgba(242,169,59,0.16)"
        initial={{ y: y + h, height: 0 }}
        animate={{ y: y + h - fillH, height: fillH }}
        transition={{ duration: reduce ? 0 : 2.2, delay: reduce ? 0 : delay, ease }}
      />
      <motion.line
        x1={x + 2}
        x2={x + w - 2}
        stroke="#F2A93B"
        strokeWidth="1.5"
        initial={{ y1: y + h, y2: y + h }}
        animate={{ y1: y + h - fillH, y2: y + h - fillH }}
        transition={{ duration: reduce ? 0 : 2.2, delay: reduce ? 0 : delay, ease }}
      />
      <rect x={x} y={y} width={w} height={h} rx="3" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <path d={`M${x} ${y} Q${x + w / 2} ${y - 16} ${x + w} ${y}`} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={x + w} x2={x + w + 6} y1={y + h * t} y2={y + h * t} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      ))}
      <text x={x + w / 2} y={y + h + 20} textAnchor="middle" className="lp-mono" fontSize="10" fill="rgba(255,255,255,0.5)" letterSpacing="1.5">{label}</text>
    </g>
  );
}

function HeroSchematic() {
  const reduce = useReducedMotion();
  const draw = (d: number) => ({ initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: reduce ? 0 : 1.8, delay: reduce ? 0 : d, ease: "easeInOut" as const } });
  const pipes = ["M40 400 H600", "M130 330 V300 H250 V330", "M310 330 V300 H420", "M470 300 V250", "M560 400 V330"];
  const route = "M70 120 C 200 40, 380 40, 520 110";
  return (
    <svg viewBox="0 0 640 460" className="h-auto w-full" role="img" aria-label="Drawing of a fuel terminal with storage tanks, a sphere and pipelines, and a travel route from Hyderabad to a project site">
      {/* travel route */}
      <path d={route} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" strokeLinecap="round" />
      <motion.path d={route} fill="none" stroke="#F2A93B" strokeWidth="1.5" strokeDasharray="4 10" className="lp-flow" {...draw(0.6)} />
      <circle cx="70" cy="120" r="6" fill="#0F1A22" stroke="#F2A93B" strokeWidth="2" />
      <circle cx="520" cy="110" r="6" fill="#0F1A22" stroke="#5CCFC6" strokeWidth="2" />
      <text x="70" y="148" textAnchor="middle" className="lp-mono" fontSize="11" fill="rgba(255,255,255,0.75)" letterSpacing="2">HYD</text>
      <text x="520" y="138" textAnchor="middle" className="lp-mono" fontSize="11" fill="rgba(255,255,255,0.75)" letterSpacing="2">SITE</text>
      {!reduce && (
        <circle r="4" fill="#F2A93B" style={{ filter: "drop-shadow(0 0 6px rgba(242,169,59,0.9))" }}>
          <animateMotion dur="5.5s" repeatCount="indefinite" path={route} />
        </circle>
      )}

      {/* ground and pipes */}
      <line x1="20" x2="620" y1="430" y2="430" stroke="rgba(255,255,255,0.12)" strokeDasharray="2 6" />
      {pipes.map((d, i) => (
        <g key={d}>
          <motion.path d={d} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="6" strokeLinecap="round" {...draw(0.2 + i * 0.15)} />
          <path d={d} fill="none" stroke="#F2A93B" strokeWidth="2" strokeLinecap="round" className="lp-flow" opacity="0.85" />
        </g>
      ))}

      {/* tanks */}
      <Tank x={80} y={250} w={100} h={80} level={0.62} delay={0.8} label="TK-101" />
      <Tank x={200} y={262} w={100} h={68} level={0.4} delay={1.0} label="TK-102" />
      <Tank x={320} y={270} w={80} h={60} level={0.78} delay={1.2} label="TK-103" />

      {/* LPG sphere */}
      <g>
        <motion.circle cx="510" cy="290" r="44" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" {...draw(0.9)} />
        <ellipse cx="510" cy="290" rx="44" ry="12" fill="none" stroke="rgba(255,255,255,0.15)" />
        <path d="M478 320 L466 400 M542 320 L554 400 M494 330 L490 400 M526 330 L530 400" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <text x="510" y="294" textAnchor="middle" className="lp-mono" fontSize="10" fill="rgba(255,255,255,0.55)" letterSpacing="1.5">LPG-S1</text>
      </g>

      {/* valves */}
      {[[250, 300], [420, 300], [560, 365]].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`} transform={`translate(${cx} ${cy})`}>
          <path d="M-7 -6 L7 6 M-7 6 L7 -6" stroke="#5CCFC6" strokeWidth="2" />
          <rect x="-8" y="-7" width="16" height="14" fill="none" stroke="rgba(92,207,198,0.4)" />
        </g>
      ))}

      {/* drawing title block */}
      <g transform="translate(424 20)">
        <rect width="200" height="56" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" />
        <line x1="0" x2="200" y1="24" y2="24" stroke="rgba(255,255,255,0.12)" />
        <text x="10" y="16" className="lp-mono" fontSize="9" fill="rgba(255,255,255,0.5)" letterSpacing="1.5">DWG · TRAPPLE / FIELD MOBILITY</text>
        <text x="10" y="44" className="lp-mono" fontSize="11" fill="#F2A93B" letterSpacing="1.5">REV 2026 · MAHATHI INFRA</text>
      </g>
    </svg>
  );
}

/** Small card on the hero that walks through a request's states. */
function LiveRequestCard() {
  const reduce = useReducedMotion();
  const states = [
    { label: "Waiting for decision", icon: Clock3, color: "#F2A93B" },
    { label: "Approved by the CEO", icon: CheckCircle2, color: "#5CCFC6" },
    { label: "Booked by the Admin", icon: Plane, color: "#5CCFC6" },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % states.length), 2600);
    return () => clearInterval(t);
  }, [reduce, states.length]);
  const s = states[i];
  return (
    <div className="w-[min(320px,80vw)] rounded-[14px] border border-white/10 bg-[#0F1A22]/80 p-4 text-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-md">
      <div className="lp-mono flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/50">
        <span>Travel request</span>
        <span>REQ-2611</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="lp-display text-2xl font-extrabold">HYD</div>
          <div className="text-[11px] text-white/50">Hyderabad</div>
        </div>
        <div className="mb-3 h-px flex-1 border-t border-dashed border-[#F2A93B]/50" />
        <div className="text-right">
          <div className="lp-display text-2xl font-extrabold">PPD</div>
          <div className="text-[11px] text-white/50">Paradip site</div>
        </div>
      </div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease }}
            className="lp-mono flex items-center gap-2 text-[11px] uppercase tracking-[0.1em]"
            style={{ color: s.color }}
          >
            <s.icon className="h-3.5 w-3.5" /> {s.label}
          </motion.div>
        </AnimatePresence>
        <div className="mt-2 flex gap-1">
          {states.map((_, n) => (
            <span key={n} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.span className="block h-full bg-[#F2A93B]" animate={{ width: n <= i ? "100%" : "0%" }} transition={{ duration: 0.6, ease }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* ------------------------------------------------------------------------- */

function Navbar({ onSignIn }: { onSignIn: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 30);
      let current = "";
      for (const n of NAV) {
        const el = document.getElementById(n.id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) current = n.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    setTimeout(() => scrollToId(id), open ? 300 : 0);
  };

  return (
    <>
      <motion.header
        initial={{ y: reduce ? 0 : -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease, delay: 0.1 }}
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${scrolled ? "border-b border-white/10 bg-[#0B1319]/85 backdrop-blur-xl" : "bg-transparent"}`}
      >
        <div className={`${container} flex h-[72px] items-center justify-between`}>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
            <Logo light />
          </button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => go(n.id)}
                className={`relative rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${active === n.id ? "text-white" : "text-white/60 hover:text-white"}`}
              >
                {active === n.id && <motion.span layoutId="lp-nav" className="absolute inset-0 -z-10 rounded-lg bg-white/[0.07]" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
                {n.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <PrimaryButton onClick={onSignIn} className="!px-4 !py-2.5 !text-[13px]">Sign in</PrimaryButton>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 text-white md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] bg-[#0B1319] text-white md:hidden"
            initial={{ clipPath: "circle(0% at calc(100% - 40px) 36px)" }}
            animate={{ clipPath: "circle(150% at calc(100% - 40px) 36px)" }}
            exit={{ clipPath: "circle(0% at calc(100% - 40px) 36px)" }}
            transition={{ duration: 0.6, ease }}
          >
            <div className={`${container} flex h-[72px] items-center justify-between`}>
              <Logo light />
              <button type="button" className="grid h-10 w-10 place-items-center rounded-lg border border-white/15" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className={`${container} mt-8 flex flex-col`} aria-label="Sections">
              {NAV.map((n, i) => (
                <motion.button
                  key={n.id}
                  type="button"
                  onClick={() => go(n.id)}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.06, duration: 0.5, ease }}
                  className="lp-display flex items-center justify-between border-b border-white/10 py-5 text-left text-3xl font-extrabold"
                >
                  {n.label}
                  <span className="lp-mono text-xs text-[#F2A93B]">0{i + 1}</span>
                </motion.button>
              ))}
              <div className="mt-10">
                <PrimaryButton onClick={onSignIn}>Sign in to Trapple</PrimaryButton>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Sections                                                                   */
/* ------------------------------------------------------------------------- */

function Hero({ onSignIn }: { onSignIn: () => void }) {
  const ref = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();
  const [flat, setFlat] = useState(false);
  const onFail = useCallback(() => setFlat(true), []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const sceneOpacity = useTransform(scrollYProgress, [0, 0.9], [1, reduce ? 1 : 0.15]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);

  return (
    <section id="top" ref={ref} className="lp-grid-dark relative flex flex-col overflow-hidden bg-[#0B1319] pt-28 text-white lg:min-h-[100svh] lg:flex-row lg:items-center lg:pt-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_600px_at_72%_45%,rgba(242,169,59,0.14),transparent_60%),radial-gradient(700px_400px_at_10%_95%,rgba(27,163,156,0.12),transparent_60%)]" />

      {/* 3D plant: behind the text on wide screens, under it on phones */}
      <motion.div
        className="relative order-2 -mt-4 h-[360px] sm:h-[460px] lg:absolute lg:mt-0 lg:inset-0 lg:h-auto"
        style={{ opacity: sceneOpacity }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, ease }}
      >
        {flat ? (
          <div className="mx-auto flex h-full max-w-[760px] items-center px-5 lg:ml-[46%] lg:max-w-[52%]">
            <HeroSchematic />
          </div>
        ) : (
          <Suspense fallback={null}>
            <TerminalScene3D className="absolute inset-0" onFail={onFail} reduceMotion={!!reduce} />
          </Suspense>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0B1319] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-[#0B1319] via-[#0B1319]/70 to-transparent lg:block" />
        <motion.div
          className="absolute bottom-10 right-8 z-10 hidden sm:block lg:bottom-14 lg:right-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 2.4 }}
        >
          <LiveRequestCard />
        </motion.div>
      </motion.div>

      <motion.div className={`${container} relative z-10 order-1 lg:pb-24`} style={{ y: textY }}>
        <div className="max-w-[40rem] lg:pointer-events-none [&_button]:pointer-events-auto">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.2 }}>
            <Kicker dark>Mahathi Infra Services · Travel desk</Kicker>
          </motion.div>
          <h1 className="lp-display mt-7 text-[clamp(2.4rem,4.6vw,4.6rem)] font-extrabold">
            <WordReveal lines={["Site teams move.", "Projects keep", "flowing."]} gradientLast onLoad delay={0.3} />
          </h1>
          <motion.p
            className="mt-7 max-w-xl text-base leading-relaxed text-white/70 md:text-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.9 }}
          >
            Trapple is the travel desk for the engineers, site crews and managers who build Mahathi's terminals, tank farms and
            pipelines. Request a trip, get one clear decision from the CEO and Admin, book it, and see every rupee by project.
          </motion.p>
          <motion.div className="mt-9 flex flex-wrap gap-3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 1.05 }}>
            <PrimaryButton onClick={onSignIn}>Sign in to Trapple</PrimaryButton>
            <GhostButton onClick={() => scrollToId("workflow")}>See how it works</GhostButton>
          </motion.div>
          <motion.dl
            className="mt-12 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.25 }}
          >
            {[
              ["Since", "2010"],
              ["Head office", "Hyderabad"],
              ["Group presence", "IN · GA · LR"],
            ].map(([k, v]) => (
              <div key={k} className="bg-[#0B1319]/90 px-4 py-4">
                <dt className="lp-mono text-[10px] uppercase tracking-[0.16em] text-white/45">{k}</dt>
                <dd className="lp-display mt-1.5 text-[15px] font-bold text-white sm:text-lg">{v}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </motion.div>

      {/* scroll cue */}
      <motion.button
        type="button"
        onClick={() => scrollToId("platform")}
        className="lp-mono absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/45 hover:text-white lg:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.8, duration: 0.8 }}
        aria-label="Scroll to the platform section"
      >
        Scroll
        <span className="relative h-10 w-px overflow-hidden bg-white/15">
          <span className="lp-scrollcue absolute inset-x-0 top-0 h-1/2 bg-[#F2A93B]" />
        </span>
      </motion.button>
    </section>
  );
}

function CapabilityTicker() {
  const items = [...CAPABILITIES, ...CAPABILITIES];
  return (
    <div className="overflow-hidden border-y border-[#0F1A22]/10 bg-[#F2A93B] py-4 text-[#0F1A22]" aria-label="What Mahathi Infra Services builds">
      <div className="lp-marquee flex w-max items-center gap-10">
        {items.map((c, i) => (
          <span key={i} className="lp-display flex items-center gap-10 whitespace-nowrap text-lg font-extrabold uppercase tracking-[0.02em]" aria-hidden={i >= CAPABILITIES.length}>
            {c}
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="#0F1A22" strokeWidth="2" /></svg>
          </span>
        ))}
      </div>
    </div>
  );
}

function Platform() {
  return (
    <section id="platform" className="lp-grid-light relative bg-[#F3F4F1] py-24 md:py-32">
      <div className={container}>
        <SectionHeader
          kicker="The platform"
          title={["Built for people", "who work on site."]}
          intro="Mahathi's work happens at terminals, ports and pipeline corridors far from head office. Trapple keeps every trip, booking and claim in one place, so nobody chases emails."
        />
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08}>
              <article className="lp-card relative h-full overflow-hidden rounded-[14px] border border-[#E2E5E0] bg-white p-7">
                <div className="flex items-start justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-[10px] bg-[#0F1A22] text-[#F2A93B]">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <span className="lp-mono text-[11px] tracking-[0.16em] text-[#8796A0]">0{i + 1}</span>
                </div>
                <h3 className="mt-7 text-xl font-bold text-[#0F1A22]">{f.title}</h3>
                <p className="mt-3 leading-relaxed text-[#56656F]">{f.text}</p>
                <span className="lp-card-line absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-[#F2A93B] to-[#1BA39C]" />
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 24 });
  const scale = reduce ? 1 : progress;
  return (
    <section id="workflow" className="lp-grid-dark relative overflow-hidden bg-[#0B1319] py-24 text-white md:py-32">
      <div className={container}>
        <SectionHeader
          dark
          kicker="Workflow"
          title={["From request", "to report."]}
          intro="Four steps, one line. Each trip moves through the same pipeline, and everyone sees where it stands."
        />
        <div ref={ref} className="relative mt-20">
          {/* the pipeline */}
          <div className="absolute left-0 right-0 top-[27px] hidden h-[6px] rounded-full bg-white/10 md:block" />
          <motion.div className="absolute left-0 right-0 top-[27px] hidden h-[6px] origin-left rounded-full bg-gradient-to-r from-[#F2A93B] to-[#1BA39C] md:block" style={{ scaleX: scale }} />
          <ol className="relative grid gap-10 md:grid-cols-4 md:gap-6">
            {STEPS.map((s, i) => (
              <Reveal key={s.code} delay={i * 0.12}>
                <li className="relative">
                  <div className="relative z-10 grid h-[60px] w-[60px] place-items-center rounded-full border-2 border-[#F2A93B] bg-[#0B1319]">
                    <span className="lp-mono text-sm font-semibold text-[#F2A93B]">{s.code}</span>
                  </div>
                  <h3 className="mt-6 text-2xl font-extrabold">{s.title}</h3>
                  <p className="mt-3 max-w-[18rem] leading-relaxed text-white/60">{s.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Portals({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section id="portals" className="bg-[#F3F4F1] py-24 md:py-32">
      <div className={container}>
        <SectionHeader kicker="Three portals" title={["Everyone sees", "just their part."]} intro="Employees, the Admin and the CEO each get a short menu built for their job. Nothing repeated, nothing in the way." />
        <div className="mt-16 grid gap-4 lg:grid-cols-3">
          {PORTALS.map((p, i) => (
            <Reveal key={p.tag} delay={i * 0.1}>
              <article
                className={`lp-card relative flex h-full flex-col overflow-hidden rounded-[16px] border p-8 ${
                  p.featured ? "border-[#0F1A22] bg-[#0F1A22] text-white" : "border-[#E2E5E0] bg-white text-[#0F1A22]"
                }`}
              >
                <span className={`lp-mono w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${p.featured ? "bg-[#F2A93B] text-[#0F1A22]" : "bg-[#0F1A22]/[0.06] text-[#56656F]"}`}>{p.tag}</span>
                <h3 className="mt-6 text-3xl font-extrabold">{p.title}</h3>
                <ul className="mt-7 flex-1 space-y-3.5">
                  {p.points.map((pt) => (
                    <li key={pt} className={`flex items-start gap-3 ${p.featured ? "text-white/75" : "text-[#56656F]"}`}>
                      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${p.featured ? "text-[#F2A93B]" : "text-[#1BA39C]"}`} />
                      {pt}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onSignIn}
                  className={`group mt-9 inline-flex items-center gap-2 text-sm font-bold ${p.featured ? "text-[#F2A93B]" : "text-[#0F1A22]"}`}
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Open the {p.tag} portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <span className="lp-card-line absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-[#F2A93B] to-[#1BA39C]" />
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section id="security" className="bg-white py-24 md:py-32">
      <div className={`${container} grid gap-14 lg:grid-cols-12`}>
        <div className="lg:col-span-5">
          <Reveal><Kicker>Security</Kicker></Reveal>
          <h2 className="lp-display mt-6 text-[clamp(2.2rem,4.6vw,4.2rem)] font-extrabold text-[#0F1A22]">
            <WordReveal lines={["Safety first,", "on site and", "on screen."]} />
          </h2>
          <Reveal delay={0.15}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-[#56656F]">
              The same discipline Mahathi applies to fire protection and hazardous storage goes into who can see what in Trapple.
            </p>
          </Reveal>
        </div>
        <div className="grid gap-px overflow-hidden rounded-[16px] border border-[#E2E5E0] bg-[#E2E5E0] sm:grid-cols-2 lg:col-span-7">
          {SECURITY.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08} className="bg-white">
              <div className="group h-full p-7 transition-colors duration-300 hover:bg-[#F7F8F6]">
                <s.icon className="h-6 w-6 text-[#1BA39C] transition-transform duration-500 group-hover:-translate-y-1" />
                <h3 className="mt-5 text-lg font-bold text-[#0F1A22]">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-[#56656F]">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const items = [
    { icon: UsersRound, k: "Portals", v: "3", note: "Employee, Admin, CEO" },
    { icon: BarChart3, k: "Intelligence views", v: "4", note: "Project, travel, employee, finance" },
    { icon: FileSpreadsheet, k: "Upload formats", v: "XLSX · CSV · PDF", note: "Checked before saving" },
  ];
  return (
    <div ref={ref} className="border-y border-[#E2E5E0] bg-[#F7F8F6]">
      <div className={`${container} grid divide-y divide-[#E2E5E0] md:grid-cols-3 md:divide-x md:divide-y-0`}>
        {items.map((it, i) => (
          <motion.div
            key={it.k}
            className="flex items-center gap-5 py-8 md:px-8"
            initial={{ opacity: 0, y: reduce ? 0 : 16 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.7, ease, delay: i * 0.1 }}
          >
            <it.icon className="h-6 w-6 shrink-0 text-[#E8961C]" />
            <div>
              <div className="lp-mono text-[10px] uppercase tracking-[0.16em] text-[#8796A0]">{it.k}</div>
              <div className="lp-display text-2xl font-extrabold text-[#0F1A22]">{it.v}</div>
              <div className="text-sm text-[#56656F]">{it.note}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function CallToAction({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="lp-grid-dark relative overflow-hidden bg-[#0B1319] py-24 text-white md:py-28">
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-60" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 70 H1200" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
        <path d="M0 70 H1200" stroke="#F2A93B" strokeWidth="2" className="lp-flow" />
      </svg>
      <div className={`${container} relative flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-end`}>
        <div>
          <Kicker dark>Next site visit</Kicker>
          <h2 className="lp-display mt-6 text-[clamp(2.4rem,5.4vw,5rem)] font-extrabold">
            <WordReveal lines={["Ready when", "the crew is."]} gradientLast />
          </h2>
        </div>
        <Reveal delay={0.2}>
          <PrimaryButton onClick={onSignIn}>Sign in to Trapple</PrimaryButton>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#070C10] py-12 text-white/55">
      <div className={`${container} flex flex-col gap-8 md:flex-row md:items-center md:justify-between`}>
        <div className="flex items-center gap-5">
          <Logo light />
          <span className="lp-mono hidden border-l border-white/15 pl-5 text-[11px] uppercase tracking-[0.14em] sm:inline">Travel desk</span>
        </div>
        <div className="lp-mono text-[11px] leading-relaxed tracking-[0.04em] md:text-right">
          <div>Mahathi Infra Services Pvt. Ltd. · Hyderabad, Telangana</div>
          <div className="mt-1 text-white/35">© {new Date().getFullYear()} Trapple. For Mahathi Infra Services employees.</div>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage({ onSignIn }: LandingPageProps) {
  return (
    <div className="lp min-h-screen overflow-x-hidden">
      <Navbar onSignIn={onSignIn} />
      <main>
        <Hero onSignIn={onSignIn} />
        <CapabilityTicker />
        <Platform />
        <Stats />
        <Workflow />
        <Portals onSignIn={onSignIn} />
        <Security />
        <CallToAction onSignIn={onSignIn} />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
