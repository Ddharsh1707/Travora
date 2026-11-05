import { useState, useEffect } from "react";
import {
  Plane,
  ShieldCheck,
  TicketCheck,
  UsersRound,
  FileSpreadsheet,
  TrendingUp,
  BarChart3,
  Building2,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Lock,
  Check,
  X,
  Menu,
  Sun,
  Moon,
  Globe,
  Compass,
  Calendar,
  Clock,
  ChevronRight,
  Layers,
  FileText,
  DollarSign,
  Briefcase,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface LandingPageProps {
  onSignIn: () => void;
}

export function LandingPage({ onSignIn }: LandingPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "approvals" | "spend">("overview");

  // Track scroll for navbar background blur enhancement
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 font-sans selection:bg-teal-500 selection:text-white">
      {/* Background Decorative Gradients & Grid Pattern */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[140px] opacity-25"
          style={{ background: "radial-gradient(circle, #14B8A6 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[650px] h-[650px] rounded-full blur-[160px] opacity-20"
          style={{ background: "radial-gradient(circle, #0D9488 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-10 left-1/4 w-[500px] h-[500px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #0284C7 0%, transparent 70%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* 1. STICKY NAVIGATION BAR */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 border-b ${
          scrolled
            ? "bg-[#070B14]/90 backdrop-blur-md border-slate-800/80 shadow-lg shadow-black/20"
            : "bg-[#070B14]/60 backdrop-blur-sm border-slate-800/40"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Brand */}
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 via-teal-500 to-teal-700 flex items-center justify-center text-white shadow-md shadow-teal-500/25 group-hover:scale-105 transition-transform duration-200">
              <Plane size={20} strokeWidth={2.4} className="group-hover:rotate-6 transition-transform" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-2xl tracking-tight text-white font-['Outfit',sans-serif]">
                trapple
              </span>
              <span className="hidden sm:inline-flex items-center text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/30">
                Enterprise
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-slate-300">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="hover:text-white transition-colors"
            >
              Home
            </button>
            <button
              onClick={() => scrollToSection("features")}
              className="hover:text-teal-400 transition-colors"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection("how-it-works")}
              className="hover:text-teal-400 transition-colors"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection("solutions")}
              className="hover:text-teal-400 transition-colors"
            >
              Solutions
            </button>
            <button
              onClick={() => scrollToSection("intelligence")}
              className="hover:text-teal-400 transition-colors flex items-center gap-1.5"
            >
              <span>Travel Intelligence</span>
              <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/30">
                New
              </span>
            </button>
            <button
              onClick={() => scrollToSection("about")}
              className="hover:text-teal-400 transition-colors"
            >
              About
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden sm:flex items-center gap-3.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <button
              type="button"
              onClick={onSignIn}
              className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white font-bold text-sm tracking-wide shadow-md shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/30 transition-all duration-200 cursor-pointer"
            >
              <Lock size={14} className="opacity-80" />
              <span>Sign In</span>
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Mobile Hamburger Toggle */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-9 h-9 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 flex items-center justify-center"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-10 h-10 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 flex items-center justify-center"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-b border-slate-800 bg-[#0B0F19]/95 backdrop-blur-xl px-4 pt-4 pb-6 space-y-3">
            <div className="grid gap-2">
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800/80"
              >
                Home
              </button>
              <button
                onClick={() => scrollToSection("features")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800/80"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection("how-it-works")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800/80"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection("solutions")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800/80"
              >
                Solutions
              </button>
              <button
                onClick={() => scrollToSection("intelligence")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800/80"
              >
                Travel Intelligence
              </button>
              <button
                onClick={() => scrollToSection("about")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800/80"
              >
                About
              </button>
            </div>
            <div className="pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSignIn();
                }}
                className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20"
              >
                <Lock size={15} />
                <span>Sign In to Portal</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION */}
      <section id="hero" className="relative z-10 pt-12 pb-24 md:pt-20 md:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Hero Left Content */}
            <div className="lg:col-span-6 space-y-7 text-center lg:text-left">
              {/* Product Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase bg-teal-500/10 text-teal-400 border border-teal-500/30 shadow-xs">
                <Sparkles size={13} className="text-teal-400" />
                <span>Enterprise Corporate Mobility Platform</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.12]">
                Corporate Travel.{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-teal-300 to-cyan-400">
                  Simplified. Controlled. Connected.
                </span>
              </h1>

              {/* Supporting Description */}
              <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0 font-normal">
                Trapple brings employee travel requests, approvals, corporate bookings, expense visibility and travel
                intelligence together in one centralized platform.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white font-bold text-sm tracking-wide shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <span>Get Started / Sign In</span>
                  <ArrowRight size={17} />
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection("features")}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-slate-700/80 hover:border-slate-600 bg-slate-900/60 hover:bg-slate-800/80 text-slate-200 font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <SlidersHorizontal size={15} className="text-teal-400" />
                  <span>Explore Features</span>
                </button>
              </div>

              {/* Trust Badges */}
              <div className="pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-6 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-teal-400 shrink-0" />
                  <span>Role-Based Access (RBAC)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-teal-400 shrink-0" />
                  <span>Multi-Tenant Architecture</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-teal-400 shrink-0" />
                  <span>Centralized Travel Desk</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-teal-400 shrink-0" />
                  <span>Full Financial Traceability</span>
                </div>
              </div>
            </div>

            {/* Hero Right: High-Fidelity UI Representation */}
            <div className="lg:col-span-6 relative">
              <div className="relative mx-auto max-w-lg lg:max-w-none">
                {/* Glow backdrop */}
                <div className="absolute -inset-1.5 bg-gradient-to-r from-teal-500/30 to-cyan-500/30 rounded-3xl blur-2xl opacity-50" />

                {/* Main Mockup Window */}
                <div className="relative rounded-2xl border border-slate-700/80 bg-[#0F1626]/95 shadow-2xl backdrop-blur-xl overflow-hidden text-slate-200">
                  {/* Window Chrome Header */}
                  <div className="px-4 py-3 bg-[#0B101D] border-b border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                      <span className="ml-2 font-mono text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                        <Lock size={11} className="text-teal-400" /> trapple.internal/operations-desk
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10.5px] font-semibold text-emerald-400">Live Workstation</span>
                    </div>
                  </div>

                  {/* Dashboard Preview Tabs */}
                  <div className="px-5 pt-4 pb-2 border-b border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveTab("overview")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          activeTab === "overview"
                            ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Operations Overview
                      </button>
                      <button
                        onClick={() => setActiveTab("approvals")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          activeTab === "approvals"
                            ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Pending Sign-offs (4)
                      </button>
                      <button
                        onClick={() => setActiveTab("spend")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          activeTab === "spend"
                            ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Spend Intelligence
                      </button>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">MISPL Tenant</span>
                  </div>

                  {/* Dashboard Content Body */}
                  <div className="p-5 space-y-4 text-xs">
                    {/* Top Stats Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Active Journeys
                        </span>
                        <div className="text-lg font-bold text-white font-mono">28</div>
                        <span className="text-[9.5px] text-teal-400 font-semibold">+14% vs last mo</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Pending Approvals
                        </span>
                        <div className="text-lg font-bold text-amber-400 font-mono">4</div>
                        <span className="text-[9.5px] text-amber-300 font-semibold">Requires action</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Monthly Spend
                        </span>
                        <div className="text-lg font-bold text-emerald-400 font-mono">₹24.8L</div>
                        <span className="text-[9.5px] text-slate-400">On target budget</span>
                      </div>
                    </div>

                    {/* Active Flight Booking Record Card */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-teal-500/30 shadow-md">
                      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
                            <Plane size={14} />
                          </span>
                          <span className="font-bold text-white text-xs">DEL ✈ BOM · Sector Express</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <Check size={11} strokeWidth={3} /> Booked & Issued
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 text-[10px] block">Passenger</span>
                          <strong className="text-white">Rajesh Sharma</strong>
                          <span className="text-slate-500 block text-[10px]">MISPL0042 · Operations</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 text-[10px] block">Flight & PNR</span>
                          <strong className="text-teal-400 font-mono">IndiGo 6E-2041</strong>
                          <span className="text-slate-400 block font-mono text-[10px]">PNR: 6E-88219</span>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10.5px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Calendar size={12} className="text-teal-400" /> Travel Date: 14 Nov, 08:30 AM
                        </span>
                        <span className="font-mono font-bold text-white">Fare: ₹6,420</span>
                      </div>
                    </div>

                    {/* Secondary Record: Approval Notification */}
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">
                          <Clock size={16} />
                        </div>
                        <div>
                          <strong className="text-white text-xs block">BLR ✈ DXB · Singapore Site Mobilization</strong>
                          <span className="text-slate-400 text-[10.5px]">Awaiting VP sign-off · ₹52,400</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-md text-[10.5px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Reviewing
                      </span>
                    </div>

                    {/* Spend Intelligence Mini Bar Graph */}
                    <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="text-slate-400 font-semibold flex items-center gap-1">
                          <TrendingUp size={12} className="text-teal-400" /> Month-on-Month Travel Expenditure
                        </span>
                        <span className="text-teal-400 font-mono font-bold">FY 2025-26</span>
                      </div>
                      <div className="h-10 flex items-end gap-1.5 pt-1">
                        {[45, 62, 50, 78, 65, 88, 72, 95, 82, 100, 75, 90].map((val, idx) => (
                          <div
                            key={idx}
                            className="flex-1 bg-gradient-to-t from-teal-600/40 to-teal-400 rounded-t-xs hover:to-teal-300 transition-all"
                            style={{ height: `${val}%` }}
                            title={`Month ${idx + 1}: ${val}%`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Mockup Footer Caption */}
                  <div className="px-4 py-2 bg-[#0A0E1A] border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
                    <span>* Illustrative enterprise interface preview</span>
                    <span className="text-teal-400 font-semibold">Trapple Mobility Engine v2.4</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PROBLEM & SOLUTION SECTION */}
      <section id="solutions-overview" className="relative z-10 py-20 bg-[#090D18]/80 border-y border-slate-800/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
              The Fragmentation Challenge
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Why Traditional Corporate Travel Fails Growing Businesses
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              When employee movements are scattered across emails, chat messages, offline agency phone calls, and
              disconnected spreadsheets, enterprises face major operational friction and untracked financial leakage.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            {/* The Old Way: Fragmented Problems */}
            <div className="rounded-2xl border border-rose-900/40 bg-gradient-to-b from-rose-950/20 to-slate-900/60 p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-rose-900/40 pb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center font-bold">
                  <X size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">The Fragmented Approach</h3>
                  <span className="text-xs text-rose-300">Bottlenecks, hidden costs, and zero audit control</span>
                </div>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="text-rose-400 font-bold shrink-0 mt-0.5">✕</span>
                  <div>
                    <strong className="text-white block font-semibold">Unorganized employee travel requests</strong>
                    <span className="text-slate-400 text-xs">
                      Requests arrive via WhatsApp, personal email, or word-of-mouth with incomplete details.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-rose-400 font-bold shrink-0 mt-0.5">✕</span>
                  <div>
                    <strong className="text-white block font-semibold">Manual, delayed approval processes</strong>
                    <span className="text-slate-400 text-xs">
                      Approvers are overwhelmed by vague requests without budget context, delaying urgent ticketing.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-rose-400 font-bold shrink-0 mt-0.5">✕</span>
                  <div>
                    <strong className="text-white block font-semibold">Scattered booking information</strong>
                    <span className="text-slate-400 text-xs">
                      No central repository for flight PNRs, train tickets, hotel vouchers, or modification records.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-rose-400 font-bold shrink-0 mt-0.5">✕</span>
                  <div>
                    <strong className="text-white block font-semibold">Poor visibility into travel expenditure</strong>
                    <span className="text-slate-400 text-xs">
                      Finance discovers travel costs weeks after the journey when reimbursement receipts trickle in.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-rose-400 font-bold shrink-0 mt-0.5">✕</span>
                  <div>
                    <strong className="text-white block font-semibold">Difficult historical travel tracking</strong>
                    <span className="text-slate-400 text-xs">
                      Unable to trace who traveled where, when, under which project code, or what the ticket cost was.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-rose-400 font-bold shrink-0 mt-0.5">✕</span>
                  <div>
                    <strong className="text-white block font-semibold">Limited management reporting</strong>
                    <span className="text-slate-400 text-xs">
                      Leadership lacks actionable data to negotiate airline discounts or audit department budgets.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* The Trapple Way: Centralized Solution */}
            <div className="rounded-2xl border border-teal-500/40 bg-gradient-to-b from-teal-950/25 to-slate-900/60 p-6 sm:p-8 space-y-6 shadow-xl shadow-teal-950/20">
              <div className="flex items-center gap-3 border-b border-teal-500/30 pb-4">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
                  <Check size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">The Trapple Solution</h3>
                  <span className="text-xs text-teal-300">Centralized corporate mobility on one unified platform</span>
                </div>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="text-teal-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div>
                    <strong className="text-white block font-semibold">One Centralized Request Desk</strong>
                    <span className="text-slate-400 text-xs">
                      Employees submit structured requests with travel dates, project codes, and preferred modes in under 60 seconds.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-teal-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div>
                    <strong className="text-white block font-semibold">Automated Multi-Tier Approval Workflows</strong>
                    <span className="text-slate-400 text-xs">
                      Requests automatically route to designated approvers with complete budget and policy context.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-teal-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div>
                    <strong className="text-white block font-semibold">Dedicated Travel Desk Operations Console</strong>
                    <span className="text-slate-400 text-xs">
                      Travel desk coordinators fulfill flights, trains, and hotels, attaching tickets and live PNRs directly to the journey.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-teal-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div>
                    <strong className="text-white block font-semibold">Live Authoritative Spend Visibility</strong>
                    <span className="text-slate-400 text-xs">
                      Real-time aggregation of booking fares, department allocations, and fiscal year spend distributions.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-teal-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div>
                    <strong className="text-white block font-semibold">Searchable Corporate Travel Archive</strong>
                    <span className="text-slate-400 text-xs">
                      Every historical journey, passenger manifest, and agency invoice indexed for instant retrieval.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-teal-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div>
                    <strong className="text-white block font-semibold">Executive Intelligence & Audit Reports</strong>
                    <span className="text-slate-400 text-xs">
                      Instant boardroom-ready spend analytics, route frequency reports, and one-click CSV/PDF exports.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FEATURES SECTION */}
      <section id="features" className="relative z-10 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
              Enterprise Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Comprehensive Modules Engineered for Modern Corporate Travel
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Every feature is built to remove friction from travel operations while giving financial controllers and
              executives absolute governance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-teal-500/40 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                  <Plane size={22} />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  Self-Service
                </span>
                <h3 className="text-base font-bold text-white mt-2.5 mb-2">Travel Request Management</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Employees can submit corporate travel requests in under 60 seconds, specify project codes, sectors,
                  accommodation needs, and track real-time status.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Multi-sector support</span>
                <ChevronRight size={14} className="text-teal-400" />
              </div>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-teal-500/40 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                  <ShieldCheck size={22} />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  Governance
                </span>
                <h3 className="text-base font-bold text-white mt-2.5 mb-2">Approval Workflows</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Approvers can review requests with complete budget rationale, policy compliance checks, and instantly
                  approve or reject with transparent remarks.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Automated sign-off queue</span>
                <ChevronRight size={14} className="text-teal-400" />
              </div>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-teal-500/40 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                  <TicketCheck size={22} />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  Operations Desk
                </span>
                <h3 className="text-base font-bold text-white mt-2.5 mb-2">Travel Desk Operations</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Centralized booking management, itinerary coordination, PNR allocation, e-ticket uploads, modifications,
                  and structured cancellation handling.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Airline & railway fulfillment</span>
                <ChevronRight size={14} className="text-teal-400" />
              </div>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-teal-500/40 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                  <UsersRound size={22} />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  Mobilization
                </span>
                <h3 className="text-base font-bold text-white mt-2.5 mb-2">Bulk and Group Travel</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Manage large employee movements, site mobilization teams, conference delegations, and group bookings
                  with passenger manifests and flight allotments.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Passenger roster tracking</span>
                <ChevronRight size={14} className="text-teal-400" />
              </div>
            </div>

            {/* Feature 5 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-teal-500/40 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                  <FileSpreadsheet size={22} />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  Data Integration
                </span>
                <h3 className="text-base font-bold text-white mt-2.5 mb-2">Excel Import & Travel History</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Batch-import agency spreadsheets, validate duplicate entries, parse historical journeys, and maintain a
                  permanently searchable corporate travel archive.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Legacy data ingestion</span>
                <ChevronRight size={14} className="text-teal-400" />
              </div>
            </div>

            {/* Feature 6 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-teal-500/40 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                  <TrendingUp size={22} />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  Financial Control
                </span>
                <h3 className="text-base font-bold text-white mt-2.5 mb-2">Travel Spend Intelligence</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Analyze company travel expenditure, employee-wise travel frequency, department budgets, and historical
                  spending patterns with index-backed SQL performance.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Real-time fiscal analytics</span>
                <ChevronRight size={14} className="text-teal-400" />
              </div>
            </div>

            {/* Feature 7 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-teal-500/40 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                  <BarChart3 size={22} />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  Analytics
                </span>
                <h3 className="text-base font-bold text-white mt-2.5 mb-2">Reports and Analytics</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Provide management-level insights into corporate travel operations and expenditure, complete with
                  formula-safe CSV exports and printable executive digests.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Executive board exports</span>
                <ChevronRight size={14} className="text-teal-400" />
              </div>
            </div>

            {/* Feature 8 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-teal-500/40 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                  <Building2 size={22} />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  Enterprise Security
                </span>
                <h3 className="text-base font-bold text-white mt-2.5 mb-2">User & Company Management</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Manage employee directories, assign role-based permissions, configure company policies, and maintain
                  strict multi-tenant database isolation.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Role-based access (RBAC)</span>
                <ChevronRight size={14} className="text-teal-400" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS SECTION */}
      <section id="how-it-works" className="relative z-10 py-24 bg-[#090D18]/90 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-20">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
              End-to-End Workflow
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Four Steps from Travel Request to Executive Audit
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Trapple connects employees, managers, travel coordinators, and finance into an unbroken digital pipeline.
            </p>
          </div>

          {/* Desktop Horizontal Workflow & Mobile Vertical Timeline */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            {/* Desktop Connecting Flow Line */}
            <div className="hidden md:block absolute top-1/4 left-12 right-12 h-0.5 bg-gradient-to-r from-teal-500/80 via-teal-400 to-cyan-500 -z-0 opacity-40" />

            {/* Step 1 */}
            <div className="relative z-10 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-teal-500/40 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white font-extrabold text-base flex items-center justify-center mb-5 shadow-lg shadow-teal-500/25 group-hover:scale-110 transition-transform">
                  01
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block mb-1">
                  Employee Submission
                </span>
                <h3 className="text-base font-bold text-white mb-2">Submit Travel Request</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Employees log in, choose origin and destination, set departure dates, specify travel mode (Flight, Train,
                  Cab), and tag the cost center project.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 text-[11px] text-teal-400/90 font-medium flex items-center gap-1">
                <Check size={13} />
                <span>Takes under 60 seconds</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative z-10 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-teal-500/40 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white font-extrabold text-base flex items-center justify-center mb-5 shadow-lg shadow-teal-500/25 group-hover:scale-110 transition-transform">
                  02
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block mb-1">
                  Manager Review
                </span>
                <h3 className="text-base font-bold text-white mb-2">Review & Authorize</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Designated approvers review requests with full budget visibility, project justification, and approve or
                  reject with custom remarks.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 text-[11px] text-teal-400/90 font-medium flex items-center gap-1">
                <Check size={13} />
                <span>Automated notifications</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative z-10 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-teal-500/40 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white font-extrabold text-base flex items-center justify-center mb-5 shadow-lg shadow-teal-500/25 group-hover:scale-110 transition-transform">
                  03
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block mb-1">
                  Desk Fulfillment
                </span>
                <h3 className="text-base font-bold text-white mb-2">Coordinate & Book</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Travel Desk coordinates flight and train bookings, inputs official PNR references, attaches e-tickets, and
                  dispatches verified itineraries.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 text-[11px] text-teal-400/90 font-medium flex items-center gap-1">
                <Check size={13} />
                <span>E-ticket & PNR dispatched</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="relative z-10 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-teal-500/40 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white font-extrabold text-base flex items-center justify-center mb-5 shadow-lg shadow-teal-500/25 group-hover:scale-110 transition-transform">
                  04
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block mb-1">
                  Executive Visibility
                </span>
                <h3 className="text-base font-bold text-white mb-2">Monitor & Analyze</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Management monitors ongoing travel operations, tracks expenditure in real time, and audits department
                  spend through executive reports.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 text-[11px] text-teal-400/90 font-medium flex items-center gap-1">
                <Check size={13} />
                <span>Instant fiscal auditing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. ROLE-BASED PLATFORM SECTION */}
      <section id="solutions" className="relative z-10 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
              Role-Based Architecture
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Tailored Portals for Every Corporate Stakeholder
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              No clutter, no generic views. Trapple gives each role the precise controls, data, and workflows they need to
              perform at their best.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Role 1: Employee Portal */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between hover:border-teal-500/40 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-md border border-teal-500/20">
                    Employee Portal
                  </span>
                  <Plane size={18} className="text-slate-500 group-hover:text-teal-400 transition-colors" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Submit & Track Requests</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Built for traveling staff, site engineers, and executives to plan travel, monitor approvals, and download
                  e-tickets on the go.
                </p>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-teal-400" />
                    <span>Quick trip submission wizard</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-teal-400" />
                    <span>Live status tracking & timeline</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-teal-400" />
                    <span>Corporate travel calendar</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-teal-400" />
                    <span>Expense reimbursement claims</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800 text-xs font-semibold text-teal-400">
                <span>Self-service mobility →</span>
              </div>
            </div>

            {/* Role 2: Approver Portal */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between hover:border-teal-500/40 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                    Approver Portal
                  </span>
                  <ShieldCheck size={18} className="text-slate-500 group-hover:text-amber-400 transition-colors" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Review & Manage Sign-offs</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Engineered for department heads, project managers, and VPs to maintain budget discipline without slowing
                  down operations.
                </p>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-amber-400" />
                    <span>Streamlined review inbox</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-amber-400" />
                    <span>Project budget context preview</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-amber-400" />
                    <span>One-click approve or reject</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-amber-400" />
                    <span>Historical approval audit trail</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800 text-xs font-semibold text-amber-400">
                <span>Governance & compliance →</span>
              </div>
            </div>

            {/* Role 3: Travel Desk Portal */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between hover:border-teal-500/40 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-500/20">
                    Travel Desk Portal
                  </span>
                  <TicketCheck size={18} className="text-slate-500 group-hover:text-cyan-400 transition-colors" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Operations & Ticketing</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  A high-throughput command center for travel desk coordinators, booking agents, and corporate logistics
                  specialists.
                </p>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-cyan-400" />
                    <span>Centralized booking queue</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-cyan-400" />
                    <span>Bulk group travel manifests</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-cyan-400" />
                    <span>Agency Excel batch import</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-cyan-400" />
                    <span>PNR & ticket dispatch system</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800 text-xs font-semibold text-cyan-400">
                <span>Fulfillment workstation →</span>
              </div>
            </div>

            {/* Role 4: Admin Portal */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between hover:border-teal-500/40 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20">
                    Admin Portal
                  </span>
                  <Building2 size={18} className="text-slate-500 group-hover:text-purple-400 transition-colors" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Oversee & Configure</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  For enterprise IT leaders and corporate controllers to manage organizational structure, users, and global
                  settings.
                </p>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-purple-400" />
                    <span>Enterprise employee directory</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-purple-400" />
                    <span>Role-based permissions (RBAC)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-purple-400" />
                    <span>Company tenant governance</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-purple-400" />
                    <span>Corporate spend intelligence</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800 text-xs font-semibold text-purple-400">
                <span>Enterprise oversight →</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. TRAVEL INTELLIGENCE SHOWCASE */}
      <section id="intelligence" className="relative z-10 py-24 bg-[#080D1A] border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-5 space-y-6">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
                Business Travel Analytics
              </span>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                Every Trip Tells a Story.{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400">
                  Every Expense Matters.
                </span>
              </h2>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Trapple converts chaotic spreadsheets and disconnected tickets into actionable corporate intelligence.
                Gain unprecedented clarity into your corporate mobility investments.
              </p>

              <div className="space-y-3 pt-2 text-xs sm:text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <div>
                    <strong className="text-white">Total Company Travel Expenditure</strong>
                    <p className="text-slate-400 text-xs">
                      Authoritative real-time aggregation across financial years (April 1 – March 31).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <div>
                    <strong className="text-white">Employee-Wise Travel Frequency & Ledgers</strong>
                    <p className="text-slate-400 text-xs">
                      Inspect individual chronological trip histories, lifetime spends, and traveler rankings.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <div>
                    <strong className="text-white">Department-Wise Expenditure & Budget Share</strong>
                    <p className="text-slate-400 text-xs">
                      Track department spend allocations, average cost per traveler, and policy adherence.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <div>
                    <strong className="text-white">Domestic vs. Cross-Border Route Analytics</strong>
                    <p className="text-slate-400 text-xs">
                      Identify top city-pair corridors (DEL ⇄ BOM, BLR ⇄ DXB) to negotiate airline corporate deals.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Rich Illustrative Analytics Dashboard Preview */}
            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-teal-500/30 bg-[#0F1626] p-5 sm:p-7 shadow-2xl space-y-6">
                {/* Header Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                      Corporate Spend Intelligence
                    </span>
                    <h3 className="text-base font-bold text-white">Executive Fiscal Overview (FY 2025–26)</h3>
                  </div>
                  <span className="text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md">
                    Live Indexed Database
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Spend</span>
                    <strong className="text-base font-mono font-bold text-emerald-400">₹1,84,35,000</strong>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Verified bookings</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Trips</span>
                    <strong className="text-base font-bold text-white">1,420</strong>
                    <span className="text-[10px] text-slate-500 block mt-0.5">14 active sectors</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Travelers</span>
                    <strong className="text-base font-bold text-white">218</strong>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Distinct employees</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Avg / Journey</span>
                    <strong className="text-base font-mono font-bold text-teal-400">₹12,982</strong>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Includes international</span>
                  </div>
                </div>

                {/* Visual Chart Bars (Month-on-Month) */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200">Month-on-Month Corporate Spend Trend</span>
                    <span className="text-slate-400 text-[11px]">Apr 2025 → Mar 2026</span>
                  </div>
                  <div className="h-24 flex items-end gap-2 pt-4 px-1 border-b border-slate-800">
                    {[
                      { m: "Apr", val: 55, spend: "₹14.2L" },
                      { m: "May", val: 70, spend: "₹18.4L" },
                      { m: "Jun", val: 65, spend: "₹16.8L" },
                      { m: "Jul", val: 85, spend: "₹22.1L" },
                      { m: "Aug", val: 78, spend: "₹20.4L" },
                      { m: "Sep", val: 92, spend: "₹24.0L" },
                      { m: "Oct", val: 80, spend: "₹21.2L" },
                      { m: "Nov", val: 96, spend: "₹25.8L" },
                    ].map((item, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div
                          className="w-full bg-gradient-to-t from-teal-600 to-teal-400 rounded-t-sm group-hover:from-teal-500 group-hover:to-teal-300 transition-all shadow-xs"
                          style={{ height: `${item.val}%` }}
                        />
                        <span className="text-[10px] text-slate-500 font-medium">{item.m}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Department Distribution Bar & Top Corridors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <span className="font-bold text-white block">Department Spend Allocation</span>
                    <div className="space-y-1.5 text-[11px]">
                      <div>
                        <div className="flex justify-between text-slate-300 mb-0.5">
                          <span>Operations</span>
                          <span className="font-mono font-bold text-teal-400">48% (₹88.4L)</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="bg-teal-500 h-full rounded-full w-[48%]" />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-slate-300 mb-0.5">
                          <span>Engineering</span>
                          <span className="font-mono font-bold text-cyan-400">28% (₹51.6L)</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="bg-cyan-500 h-full rounded-full w-[28%]" />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-slate-300 mb-0.5">
                          <span>Projects & Client Sites</span>
                          <span className="font-mono font-bold text-emerald-400">24% (₹44.3L)</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full rounded-full w-[24%]" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <span className="font-bold text-white block">Top Corporate Corridors</span>
                    <div className="space-y-2 text-[11px]">
                      <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
                        <span className="text-slate-300 font-semibold">HYD ⇄ DEL (Delhi)</span>
                        <span className="font-mono text-teal-400 font-bold">284 trips · ₹24.2L</span>
                      </div>
                      <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
                        <span className="text-slate-300 font-semibold">BOM ⇄ BLR (Bengaluru)</span>
                        <span className="font-mono text-teal-400 font-bold">196 trips · ₹16.8L</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300 font-semibold">BLR ⇄ DXB (Dubai)</span>
                        <span className="font-mono text-cyan-400 font-bold">42 trips · ₹21.9L</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right text-[10px] text-slate-500">
                  * Illustrative data visualization based on Trapple spend analytics engine
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. ABOUT SECTION */}
      <section id="about" className="relative z-10 py-24 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
                About Trapple
              </span>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Built to Power Complex Corporate Mobility at Scale
              </h2>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Trapple was engineered to bridge the critical operational divide between traveling teams on the ground,
                busy department approvers, centralized travel desks, and corporate finance.
              </p>

              <p className="text-slate-400 text-sm leading-relaxed">
                Whether deploying engineers across project sites, coordinating executive international delegations, or
                auditing annual company travel budgets, Trapple ensures every journey is authorized, tracked, booked, and
                accounted for under strict enterprise policy.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div className="text-2xl font-bold font-mono text-teal-400">100%</div>
                  <span className="text-slate-400 font-medium">Digital Audit Trail</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div className="text-2xl font-bold font-mono text-teal-400">4 Portals</div>
                  <span className="text-slate-400 font-medium">Role-Based Access</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div className="text-2xl font-bold font-mono text-teal-400">&lt; 60s</div>
                  <span className="text-slate-400 font-medium">Request Submission</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold">
                  <ShieldCheck size={20} />
                </div>
                <h3 className="text-base font-bold text-white">Bank-Grade Multi-Tenant Isolation</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Strict tenant boundary isolation ensures zero cross-company data leakage. Cryptographic JWT authentication
                  and role-based authorization protect all endpoints.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold">
                  <TrendingUp size={20} />
                </div>
                <h3 className="text-base font-bold text-white">Database Index-Backed Speed</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Analytics, search queries, and historical spend reports run on optimized PostgreSQL database indexes,
                  delivering instant results across tens of thousands of corporate travel records.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. FINAL CTA SECTION */}
      <section className="relative z-10 py-20 bg-gradient-to-b from-[#070B14] via-[#091224] to-[#070B14] border-t border-slate-800/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl border border-teal-500/40 bg-gradient-to-r from-teal-950/40 via-slate-900 to-cyan-950/40 p-8 sm:p-12 md:p-16 text-center space-y-6 shadow-2xl overflow-hidden">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase bg-teal-500/10 text-teal-400 border border-teal-500/30">
              <Sparkles size={13} className="text-teal-400" />
              <span>Streamline Your Corporate Travel Today</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight max-w-2xl mx-auto">
              Bring Your Entire Corporate Travel Operation Together.
            </h2>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-xl mx-auto font-normal">
              From the first travel request to the final expenditure report, manage your corporate travel lifecycle in one place.
            </p>

            <div className="pt-4 flex justify-center">
              <button
                type="button"
                onClick={onSignIn}
                className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-teal-500 via-teal-400 to-teal-500 hover:from-teal-400 hover:to-teal-300 text-slate-950 font-extrabold text-base tracking-wide shadow-2xl shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] transition-all duration-200 cursor-pointer"
              >
                <Lock size={16} />
                <span>Sign In to Trapple</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 10. FOOTER */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-[#060911] text-slate-400 text-xs py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-800/80">
            {/* Column 1: Brand Info */}
            <div className="lg:col-span-2 space-y-4">
              <div
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-white font-bold">
                  <Plane size={17} strokeWidth={2.4} />
                </div>
                <span className="font-extrabold text-xl tracking-tight text-white font-['Outfit',sans-serif]">
                  trapple
                </span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
                The unified corporate travel management platform empowering modern enterprises with streamlined requests,
                approvals, ticketing, and travel intelligence.
              </p>
              <div className="pt-1 text-[11px] text-slate-500">
                Enterprise Corporate Travel Solutions
              </div>
            </div>

            {/* Column 2: Platform Links */}
            <div className="space-y-3">
              <strong className="text-xs uppercase font-bold text-slate-200 tracking-wider block">Platform</strong>
              <ul className="space-y-2 text-xs">
                <li>
                  <button onClick={() => scrollToSection("features")} className="hover:text-teal-400 transition-colors">
                    Features
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("how-it-works")} className="hover:text-teal-400 transition-colors">
                    How It Works
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("solutions")} className="hover:text-teal-400 transition-colors">
                    Solutions
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("intelligence")} className="hover:text-teal-400 transition-colors">
                    Travel Intelligence
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("about")} className="hover:text-teal-400 transition-colors">
                    About Platform
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Portals */}
            <div className="space-y-3">
              <strong className="text-xs uppercase font-bold text-slate-200 tracking-wider block">Portals</strong>
              <ul className="space-y-2 text-xs">
                <li>
                  <button onClick={onSignIn} className="hover:text-teal-400 transition-colors">
                    Employee Portal
                  </button>
                </li>
                <li>
                  <button onClick={onSignIn} className="hover:text-teal-400 transition-colors">
                    Approver Portal
                  </button>
                </li>
                <li>
                  <button onClick={onSignIn} className="hover:text-teal-400 transition-colors">
                    Travel Desk Portal
                  </button>
                </li>
                <li>
                  <button onClick={onSignIn} className="hover:text-teal-400 transition-colors">
                    Admin Portal
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4: Governance */}
            <div className="space-y-3">
              <strong className="text-xs uppercase font-bold text-slate-200 tracking-wider block">Enterprise Security</strong>
              <ul className="space-y-2 text-xs">
                <li className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle2 size={13} className="text-teal-400" />
                  <span>Role-Based Access Control</span>
                </li>
                <li className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle2 size={13} className="text-teal-400" />
                  <span>Tenant Data Isolation</span>
                </li>
                <li className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle2 size={13} className="text-teal-400" />
                  <span>Cryptographic JWT Auth</span>
                </li>
                <li className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle2 size={13} className="text-teal-400" />
                  <span>Digital Audit Trails</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <div>
              &copy; {new Date().getFullYear()} Trapple. All rights reserved.
            </div>
            <div className="flex items-center gap-6">
              <button onClick={onSignIn} className="hover:text-teal-400 transition-colors font-semibold">
                Sign In to Corporate Account
              </button>
              <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="hover:text-teal-400 transition-colors">
                Back to top ↑
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

