import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  Menu,
  Plane,
  Receipt,
  ScanLine,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { CorridorGlobe } from "@/components/CorridorGlobe";

/*
 * Public landing page in the Mahathi Infra Services design language:
 * navy blueprint surfaces, orange accents, Manrope display type set in
 * uppercase, masked word reveals and buttons whose fill sweeps up on hover.
 */

interface LandingPageProps {
  onSignIn: () => void;
}

const ease = [0.16, 1, 0.3, 1] as const;

const NAV = [
  { id: "platform", label: "Platform" },
  { id: "portals", label: "Portals" },
  { id: "process", label: "How it works" },
  { id: "security", label: "Security" },
];

const FEATURES = [
  {
    icon: Plane,
    title: "Travel requests",
    text: "Employees raise a trip in a minute. Managers approve or send it back with a note, and the travel desk sees it the moment it is cleared.",
  },
  {
    icon: Receipt,
    title: "Expense claims",
    text: "Claim cabs, hotels and meals with the receipt attached. The CEO reviews, approves and marks each claim as paid.",
  },
  {
    icon: UsersRound,
    title: "Bulk & group travel",
    text: "Move a whole site team on one booking, with every traveller, seat and cost on a single manifest.",
  },
  {
    icon: FileSpreadsheet,
    title: "Excel & CSV import",
    text: "Bring in years of past bookings from a spreadsheet. Every row is checked and previewed before it is saved.",
  },
  {
    icon: ScanLine,
    title: "Tickets & documents",
    text: "Upload a ticket or invoice and Trapple reads the route, dates and fare for you. Files stay in private storage.",
  },
  {
    icon: BarChart3,
    title: "Spend reports",
    text: "See spend by month, department and person, then export it. The CEO dashboard keeps it all on one screen.",
  },
];

const PORTALS = [
  {
    tag: "Employee",
    title: "Employee portal",
    points: ["Request travel and track approval", "Claim expenses with receipts", "Your trips, tickets and history", "Ask the travel assistant"],
  },
  {
    tag: "CEO",
    title: "CEO portal",
    points: ["Company-wide spend dashboard", "Approve claims and travel", "Add employees and create logins", "Detailed travel reports"],
  },
  {
    tag: "Manager & desk",
    title: "Approvers & travel desk",
    points: ["Approve your team's trips", "Book and issue tickets", "Bulk bookings and imports", "Cancellations in one queue"],
  },
];

const STEPS = [
  { title: "Request", text: "An employee raises a trip with dates, route and purpose." },
  { title: "Approve", text: "Their manager approves it, with spend history in view." },
  { title: "Book", text: "The travel desk books and uploads the tickets." },
  { title: "Reconcile", text: "Expenses are claimed, approved and paid, with a full trail." },
];

const MARQUEE = ["Travel requests", "Approvals", "Bookings", "Expense claims", "Group travel", "Spend reports", "Ticket scanning", "Audit trail"];

/* ------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* ------------------------------------------------------------------------- */

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - (id === "top" ? 0 : 72);
  window.scrollTo({ top, behavior: "smooth" });
}

/** Button with a fill that sweeps up from below on hover, as on the Mahathi site. */
function SweepButton({
  children,
  onClick,
  variant = "primary",
  className = "",
  icon = true,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "light" | "dark";
  className?: string;
  icon?: boolean;
}) {
  const styles = {
    primary: "bg-[#F28C28] text-[#10243A] before:bg-white",
    light: "border border-white/40 text-white before:bg-white hover:text-[#10243A]",
    dark: "bg-[#10243A] text-white before:bg-[#F28C28] hover:text-[#10243A]",
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative isolate inline-flex items-center justify-between gap-3 overflow-hidden px-7 py-4 font-display text-[13px] font-bold uppercase tracking-[0.14em] transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] before:absolute before:inset-0 before:-z-10 before:origin-bottom before:scale-y-0 before:transition-transform before:duration-500 before:ease-[cubic-bezier(0.16,1,0.3,1)] hover:before:scale-y-100 ${styles} ${className}`}
    >
      <span>{children}</span>
      {icon && (
        <span className="relative h-4 w-4 overflow-hidden" aria-hidden="true">
          <ArrowUpRight className="absolute inset-0 h-4 w-4 transition-transform duration-500 group-hover:-translate-y-full group-hover:translate-x-full" />
          <ArrowUpRight className="absolute inset-0 h-4 w-4 -translate-x-full translate-y-full transition-transform duration-500 group-hover:translate-x-0 group-hover:translate-y-0" />
        </span>
      )}
    </button>
  );
}

/** Fades and lifts its children in when they scroll into view. */
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: reduce ? 0.3 : 0.9, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Slides each word up from behind a mask. The last line can be orange. */
function RevealText({
  lines,
  as = "h2",
  className = "",
  delay = 0,
  inView = true,
  accentLast = false,
}: {
  lines: string[];
  as?: "h1" | "h2";
  className?: string;
  delay?: number;
  inView?: boolean;
  accentLast?: boolean;
}) {
  const reduce = useReducedMotion();
  const Tag = as === "h1" ? motion.h1 : motion.h2;
  let index = 0;
  const trigger = inView
    ? { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.4 } }
    : { initial: "hidden", animate: "show" };
  return (
    <Tag className={className} aria-label={lines.join(" ")} {...trigger}>
      {lines.map((line, li) => (
        <span key={li} className="block" aria-hidden="true">
          {line.split(" ").map((w, wi, arr) => {
            const i = index++;
            return (
              <span key={wi} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                <motion.span
                  className={`inline-block ${accentLast && li === lines.length - 1 ? "text-[#F28C28]" : ""}`}
                  variants={{
                    hidden: { y: reduce ? 0 : "110%", opacity: reduce ? 0 : 1 },
                    show: { y: "0%", opacity: 1, transition: { duration: reduce ? 0.3 : 1.1, ease, delay: delay + i * 0.06 } },
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
    </Tag>
  );
}

function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p
      className={`inline-flex items-center gap-3 font-display text-xs font-bold uppercase tracking-[0.22em] before:block before:h-[2px] before:w-8 before:bg-[#F28C28] ${
        dark ? "text-white/80" : "text-[#1D4E89]"
      }`}
    >
      {children}
    </p>
  );
}

function SectionHeader({ eyebrow, title, intro, dark = false }: { eyebrow: string; title: string[]; intro?: string; dark?: boolean }) {
  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
      <div className="lg:col-span-7">
        <Reveal>
          <Eyebrow dark={dark}>{eyebrow}</Eyebrow>
        </Reveal>
        <RevealText
          lines={title}
          className={`mt-6 font-display text-[clamp(2.25rem,5vw,4.5rem)] font-extrabold uppercase leading-[1] tracking-[-0.03em] ${dark ? "text-white" : "text-[#10243A]"}`}
        />
      </div>
      {intro && (
        <Reveal delay={0.2} className="lg:col-span-4 lg:col-start-9">
          <p className={`text-base leading-relaxed md:text-lg ${dark ? "text-white/70" : "text-[#252B33]/75"}`}>{intro}</p>
        </Reveal>
      )}
    </div>
  );
}

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setN(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1600);
      setN(Math.round(to * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, reduce]);
  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  );
}

const blueprint =
  "bg-[#10243A] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:96px_96px,96px_96px,24px_24px,24px_24px]";
const container = "mx-auto w-full max-w-[88rem] px-5 sm:px-8 lg:px-12";

/* ------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* ------------------------------------------------------------------------- */

function Navbar({ onSignIn }: { onSignIn: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const reduce = useReducedMotion();

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 40);
      // Hide while scrolling down past the hero, show again on any scroll up.
      setHidden(y > window.innerHeight * 0.9 && y > last + 4);
      if (y < last - 4 || y < 40) setHidden(false);
      last = y;
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
    setTimeout(() => scrollToId(id), open ? 350 : 0);
  };

  return (
    <>
      <motion.header
        initial={{ y: reduce ? 0 : -100, opacity: 0 }}
        animate={{ y: hidden && !open ? "-100%" : 0, opacity: 1 }}
        transition={{ duration: 0.8, ease, delay: hidden ? 0 : 0.2 }}
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-500 ${
          scrolled && !open ? "bg-[#10243A]/95 shadow-[0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md" : "bg-transparent"
        }`}
      >
        <nav className={`${container} flex h-[72px] items-center justify-between lg:h-20`} aria-label="Main">
          <button type="button" onClick={() => go("top")} aria-label="Trapple, back to top" className="relative z-[60]">
            <Logo light />
          </button>

          <ul className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={active === item.id ? "true" : undefined}
                  className="relative block px-4 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-white/80 transition-colors hover:text-white"
                >
                  {item.label}
                  {active === item.id && (
                    <motion.span layoutId="landing-nav-underline" className="absolute inset-x-4 -bottom-0.5 h-[2px] bg-[#F28C28]" transition={{ duration: 0.5, ease }} />
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSignIn}
              className="group hidden items-center gap-2 bg-[#F28C28] px-5 py-3 font-display text-[12px] font-bold uppercase tracking-[0.14em] text-[#10243A] transition-colors duration-300 hover:bg-white md:inline-flex"
            >
              <Lock className="h-3.5 w-3.5" /> Sign in
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="landing-mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="relative z-[60] grid h-11 w-11 place-items-center border border-white/25 text-white transition-colors hover:border-[#F28C28] hover:text-[#F28C28] lg:hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={open ? "x" : "m"}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="landing-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className={`fixed inset-0 z-40 flex flex-col lg:hidden ${blueprint}`}
            initial={{ clipPath: "inset(0% 0% 100% 0%)" }}
            animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
            exit={{ clipPath: "inset(0% 0% 100% 0%)" }}
            transition={{ duration: reduce ? 0.01 : 0.7, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className={`${container} relative flex flex-1 flex-col justify-between pb-10 pt-28`}>
              <ul className="space-y-1">
                {NAV.map((item, i) => (
                  <li key={item.id} className="overflow-hidden">
                    <motion.button
                      type="button"
                      onClick={() => go(item.id)}
                      className="group flex items-baseline gap-4 py-2 text-left font-display text-[2.6rem] font-extrabold leading-tight tracking-tight text-white sm:text-6xl"
                      initial={{ y: "100%" }}
                      animate={{ y: 0 }}
                      exit={{ y: "100%", transition: { duration: 0.3 } }}
                      transition={{ duration: 0.7, ease, delay: 0.25 + i * 0.06 }}
                    >
                      <span className="font-sans text-xs font-semibold tracking-[0.2em] text-[#F28C28]">0{i + 1}</span>
                      <span className="transition-colors group-hover:text-[#F28C28]">{item.label}</span>
                    </motion.button>
                  </li>
                ))}
              </ul>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, delay: 0.6 }} className="border-t border-white/10 pt-8">
                <SweepButton onClick={onSignIn} className="w-full">
                  Sign in to Trapple
                </SweepButton>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Page                                                                       */
/* ------------------------------------------------------------------------- */

export function LandingPage({ onSignIn }: LandingPageProps) {
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "-12%"]);
  const heroFade = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.15]);
  const globeY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "14%"]);
  const d = reduce ? 0 : 0.3;

  return (
    <div className="landing-mahathi min-h-screen bg-white font-sans text-[#252B33] antialiased">
      <Navbar onSignIn={onSignIn} />

      <main>
        {/* HERO */}
        <section id="top" ref={heroRef} className={`relative flex min-h-[100svh] flex-col overflow-hidden text-white ${blueprint}`} aria-label="Introduction">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_45%,rgba(29,78,137,0.55),transparent_60%)]" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(0deg,rgba(10,23,38,0.9),transparent)]" />

          <div className={`${container} relative grid flex-1 items-center gap-6 pb-10 pt-28 lg:grid-cols-12 lg:pb-16`}>
            <motion.div style={{ y: heroY, opacity: heroFade }} className="relative z-10 lg:col-span-7">
              <motion.div initial={{ opacity: 0, x: reduce ? 0 : -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.9, ease, delay: d }}>
                <Eyebrow dark>Trapple · Corporate travel</Eyebrow>
              </motion.div>
              <RevealText
                as="h1"
                inView={false}
                delay={d + 0.1}
                lines={["Travel that", "moves your", "teams forward."]}
                accentLast
                className="mt-7 font-display text-[clamp(2.75rem,6.6vw,6.5rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.035em] text-white"
              />
              <motion.p
                className="mt-8 max-w-xl text-base leading-relaxed text-white/75 md:text-lg"
                initial={{ opacity: 0, y: reduce ? 0 : 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, ease, delay: d + 0.75 }}
              >
                One place to request, approve, book and reconcile every business trip. Built for site teams that are always on the move, with
                every rupee and every ticket accounted for.
              </motion.p>
              <motion.div
                className="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4"
                initial={{ opacity: 0, y: reduce ? 0 : 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, ease, delay: d + 0.9 }}
              >
                <SweepButton onClick={onSignIn}>Sign in to Trapple</SweepButton>
                <SweepButton onClick={() => scrollToId("platform")} variant="light">
                  Explore the platform
                </SweepButton>
              </motion.div>
            </motion.div>

            <motion.div
              style={{ y: globeY }}
              className="relative hidden lg:col-span-5 lg:block"
              initial={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.6, ease, delay: d + 0.4 }}
            >
              <div className="relative -mr-12 xl:-mr-20">
                <CorridorGlobe />
              </div>
            </motion.div>
          </div>

          <motion.div className={`${container} relative flex items-end justify-between pb-8`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: d + 1.2 }}>
            <button
              type="button"
              onClick={() => scrollToId("platform")}
              className="group flex items-center gap-4 font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70 hover:text-white"
              aria-label="Scroll to the platform section"
            >
              <span className="relative block h-14 w-[2px] overflow-hidden bg-white/20">
                <span className="landing-scrollcue absolute inset-x-0 top-0 h-1/2 bg-[#F28C28]" />
              </span>
              Scroll
            </button>
            <ul className="hidden gap-10 font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60 md:flex">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-center gap-3">
                  <span className="text-[#F28C28]">0{i + 1}</span>
                  {s.title}
                </li>
              ))}
            </ul>
          </motion.div>
        </section>

        {/* MARQUEE */}
        <div className="overflow-hidden border-y border-[#10243A]/10 bg-[#F28C28] py-5 text-[#10243A]" aria-hidden="true">
          <div className="landing-marquee flex w-max gap-12 whitespace-nowrap font-display text-lg font-extrabold uppercase tracking-[0.08em] md:text-2xl">
            {[...MARQUEE, ...MARQUEE].map((w, i) => (
              <span key={i} className="flex items-center gap-12">
                {w}
                <span className="h-2 w-2 rotate-45 bg-[#10243A]" />
              </span>
            ))}
          </div>
        </div>

        {/* PLATFORM */}
        <section id="platform" className="bg-white py-24 md:py-32">
          <div className={container}>
            <SectionHeader
              eyebrow="The platform"
              title={["Everything a", "trip needs."]}
              intro="From the first request to the last receipt, Trapple keeps your people, approvals, tickets and spend in one secure workspace."
            />
            <div className="mt-16 grid gap-px bg-[#10243A]/10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 0.08} className="bg-white">
                  <article className="group relative h-full overflow-hidden p-8 transition-colors duration-500 hover:bg-[#10243A] md:p-10">
                    <div className="flex items-start justify-between">
                      <span className="grid h-14 w-14 place-items-center border border-[#10243A]/15 text-[#1D4E89] transition-colors duration-500 group-hover:border-[#F28C28] group-hover:text-[#F28C28]">
                        <f.icon className="h-6 w-6" />
                      </span>
                      <span className="font-display text-sm font-bold tracking-[0.2em] text-[#10243A]/30 transition-colors duration-500 group-hover:text-white/40">
                        0{i + 1}
                      </span>
                    </div>
                    <h3 className="mt-10 font-display text-2xl font-extrabold uppercase tracking-[-0.01em] text-[#10243A] transition-colors duration-500 group-hover:text-white">
                      {f.title}
                    </h3>
                    <p className="mt-4 leading-relaxed text-[#252B33]/70 transition-colors duration-500 group-hover:text-white/70">{f.text}</p>
                    <span className="absolute bottom-0 left-0 h-[3px] w-0 bg-[#F28C28] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:w-full" />
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="bg-[#F4F6F8] py-16">
          <div className={`${container} grid grid-cols-2 gap-y-10 lg:grid-cols-4`}>
            {[
              { n: 4, s: "", label: "Roles, each with its own workspace" },
              { n: 6, s: "", label: "Travel modes, from flights to cabs" },
              { n: 100, s: "%", label: "Of records behind row-level security" },
              { n: 24, s: "/7", label: "Access from desk, site or phone" },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08} className="border-l-2 border-[#F28C28] pl-6">
                <p className="font-display text-5xl font-extrabold tracking-[-0.03em] text-[#10243A] md:text-6xl">
                  <Counter to={s.n} suffix={s.s} />
                </p>
                <p className="mt-2 max-w-[16rem] text-sm text-[#252B33]/70">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* PORTALS */}
        <section id="portals" className={`relative overflow-hidden py-24 text-white md:py-32 ${blueprint}`}>
          <div className={container}>
            <SectionHeader
              dark
              eyebrow="Portals"
              title={["One app.", "A desk for", "every role."]}
              intro="Everyone signs in to the same Trapple and lands in a workspace built for their job. What each person can see is enforced by the database, not just the screen."
            />
            <div className="mt-16 grid gap-6 lg:grid-cols-3">
              {PORTALS.map((p, i) => (
                <Reveal key={p.title} delay={i * 0.1}>
                  <article className="group relative h-full border border-white/12 bg-white/[0.03] p-8 backdrop-blur-sm transition-colors duration-500 hover:border-[#F28C28]/60 md:p-10">
                    <p className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-[#F28C28]">{p.tag}</p>
                    <h3 className="mt-4 font-display text-3xl font-extrabold uppercase tracking-[-0.02em] text-white">{p.title}</h3>
                    <ul className="mt-8 space-y-4">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-3 text-white/75">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#F28C28]" />
                          {pt}
                        </li>
                      ))}
                    </ul>
                    <span className="absolute left-0 top-0 h-[3px] w-12 bg-[#F28C28] transition-all duration-700 group-hover:w-full" />
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* PROCESS */}
        <section id="process" className="bg-white py-24 md:py-32">
          <div className={container}>
            <SectionHeader eyebrow="How it works" title={["From request", "to reconciled."]} intro="Four steps, one trail. Every hand-off is recorded, so nobody has to chase an email to know where a trip stands." />
            <ol className="mt-16 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-0">
              {STEPS.map((s, i) => (
                <Reveal key={s.title} delay={i * 0.1} className="relative lg:pr-10">
                  <li className="list-none">
                    <div className="flex items-center gap-4">
                      <span className="font-display text-6xl font-extrabold tracking-[-0.04em] text-[#10243A]/10">0{i + 1}</span>
                      <span className="hidden h-px flex-1 bg-[#10243A]/15 lg:block" />
                    </div>
                    <h3 className="mt-4 font-display text-2xl font-extrabold uppercase text-[#10243A]">{s.title}</h3>
                    <p className="mt-3 leading-relaxed text-[#252B33]/70">{s.text}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* SECURITY */}
        <section id="security" className="bg-[#F4F6F8] py-24 md:py-32">
          <div className={`${container} grid gap-14 lg:grid-cols-12 lg:items-center`}>
            <div className="lg:col-span-6">
              <Reveal>
                <Eyebrow>Security</Eyebrow>
              </Reveal>
              <RevealText
                lines={["Private by", "design."]}
                className="mt-6 font-display text-[clamp(2.25rem,5vw,4.5rem)] font-extrabold uppercase leading-[1] tracking-[-0.03em] text-[#10243A]"
              />
              <Reveal delay={0.2}>
                <p className="mt-8 max-w-xl text-base leading-relaxed text-[#252B33]/75 md:text-lg">
                  Employees only ever see their own trips and claims. Tickets and receipts live in private storage, and every approval is logged
                  with who did it and when.
                </p>
              </Reveal>
            </div>
            <div className="grid gap-px bg-[#10243A]/10 sm:grid-cols-2 lg:col-span-6">
              {[
                { icon: ShieldCheck, t: "Row-level security", x: "Access rules live in the database itself." },
                { icon: Lock, t: "Encrypted sign-in", x: "Secure sessions that end when the tab closes." },
                { icon: ScanLine, t: "Private files", x: "Tickets and receipts open only for the right people." },
                { icon: Bot, t: "Careful AI", x: "The assistant answers from data you are allowed to see." },
              ].map((c, i) => (
                <Reveal key={c.t} delay={i * 0.08} className="bg-white p-8">
                  <c.icon className="h-6 w-6 text-[#F28C28]" />
                  <h3 className="mt-6 font-display text-lg font-extrabold uppercase text-[#10243A]">{c.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#252B33]/70">{c.x}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={`relative overflow-hidden py-24 text-white md:py-32 ${blueprint}`}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(242,140,40,0.18),transparent_55%)]" />
          <div className={`${container} relative grid gap-10 lg:grid-cols-12 lg:items-end`}>
            <div className="lg:col-span-8">
              <Reveal>
                <Eyebrow dark>Ready when you are</Eyebrow>
              </Reveal>
              <RevealText
                lines={["Your next trip", "starts here."]}
                accentLast
                className="mt-6 font-display text-[clamp(2.5rem,6vw,5.5rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.035em] text-white"
              />
            </div>
            <Reveal delay={0.2} className="flex flex-col gap-4 lg:col-span-4 lg:items-end">
              <p className="text-white/70 lg:text-right">Sign in with the work email your administrator set up for you.</p>
              <SweepButton onClick={onSignIn}>Sign in to Trapple</SweepButton>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="bg-[#0A1726] text-white/70">
        <div className={`${container} grid gap-10 py-14 md:grid-cols-12`}>
          <div className="md:col-span-5">
            <Logo light />
            <p className="mt-6 max-w-sm text-sm leading-relaxed">Corporate travel and expense management for Mahathi Infra Services teams.</p>
          </div>
          <div className="md:col-span-3">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-white">Explore</p>
            <ul className="mt-5 space-y-3 text-sm">
              {NAV.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => scrollToId(n.id)} className="transition-colors hover:text-[#F28C28]">
                    {n.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-4">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-white">Support</p>
            <ul className="mt-5 space-y-3 text-sm">
              <li>
                <a href="mailto:desk@mahathiinfra.com" className="transition-colors hover:text-[#F28C28]">
                  desk@mahathiinfra.com
                </a>
              </li>
              <li>
                <button type="button" onClick={onSignIn} className="transition-colors hover:text-[#F28C28]">
                  Sign in
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className={`${container} flex flex-col gap-2 py-6 text-xs sm:flex-row sm:justify-between`}>
            <span>© {new Date().getFullYear()} Trapple · Mahathi Infra Services Pvt. Ltd.</span>
            <span>Every journey. One desk.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
