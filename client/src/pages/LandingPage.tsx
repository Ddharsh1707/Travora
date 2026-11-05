import { useState, useEffect, useRef, useMemo } from "react";
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
  Download,
  AlertCircle,
  ArrowUpRight,
  Filter,
  Search,
  RefreshCw,
  Cpu,
  Radio,
  Workflow,
  Zap,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface LandingPageProps {
  onSignIn: () => void;
}

// ---------------------------------------------------------------------------
// 3D CORRIDOR GLOBE CANVAS COMPONENT
// True 3D Mathematical Projection with Particle Constellations & Flight Arcs
// ---------------------------------------------------------------------------
interface HubNode {
  id: string;
  code: string;
  city: string;
  lat: number;
  lon: number;
  activeRoutes: number;
}

const GLOBAL_HUBS: HubNode[] = [
  { id: "del", code: "DEL", city: "New Delhi", lat: 28.6139, lon: 77.209, activeRoutes: 34 },
  { id: "bom", code: "BOM", city: "Mumbai", lat: 19.076, lon: 72.8777, activeRoutes: 42 },
  { id: "blr", code: "BLR", city: "Bengaluru", lat: 12.9716, lon: 77.5946, activeRoutes: 29 },
  { id: "dxb", code: "DXB", city: "Dubai", lat: 25.2048, lon: 55.2708, activeRoutes: 24 },
  { id: "lhr", code: "LHR", city: "London", lat: 51.5074, lon: -0.1278, activeRoutes: 18 },
  { id: "sin", code: "SIN", city: "Singapore", lat: 1.3521, lon: 103.8198, activeRoutes: 21 },
  { id: "jfk", code: "JFK", city: "New York", lat: 40.7128, lon: -74.006, activeRoutes: 16 },
  { id: "sfo", code: "SFO", city: "San Francisco", lat: 37.7749, lon: -122.4194, activeRoutes: 12 },
];

const FLIGHT_ROUTES = [
  { from: "del", to: "bom", code: "TRP-204", carrier: "IndiGo 6E" },
  { from: "del", to: "blr", code: "TRP-812", carrier: "Air India AI" },
  { from: "bom", to: "dxb", code: "TRP-901", carrier: "Emirates EK" },
  { from: "del", to: "lhr", code: "TRP-115", carrier: "Virgin Atlantic" },
  { from: "blr", to: "sin", code: "TRP-302", carrier: "Singapore SQ" },
  { from: "lhr", to: "jfk", code: "TRP-001", carrier: "British Airways" },
  { from: "jfk", to: "sfo", code: "TRP-450", carrier: "Delta Air" },
  { from: "dxb", to: "sin", code: "TRP-718", carrier: "Emirates EK" },
];

function Interactive3DCorridorGlobe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredHub, setHoveredHub] = useState<HubNode | null>(null);
  const [telemetry, setTelemetry] = useState({
    coords: "28.6139° N, 77.2090° E",
    hubCount: GLOBAL_HUBS.length,
    activeRoutes: FLIGHT_ROUTES.length,
    fps: 60,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let rotX = 0.25; // initial tilt
    let rotY = 1.6; // initial longitude rotation facing India/Asia
    let targetRotX = rotX;
    let targetRotY = rotY;
    let velocityY = 0.0028; // auto rotation speed
    let mouseCanvasX = -1000;
    let mouseCanvasY = -1000;

    // Generate stable spherical particle constellation (~350 points)
    const particleCount = 380;
    const particles: { lat: number; lon: number; size: number; alpha: number }[] = [];
    for (let i = 0; i < particleCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / particleCount);
      const theta = Math.sqrt(particleCount * Math.PI) * phi;
      const lat = (Math.PI / 2 - phi) * (180 / Math.PI);
      const lon = (theta * (180 / Math.PI)) % 360;
      particles.push({
        lat,
        lon,
        size: Math.random() > 0.85 ? 2.2 : 1.3,
        alpha: 0.25 + Math.random() * 0.45,
      });
    }

    // Resize handling with devicePixelRatio
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    // Mouse & Touch interactions
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseCanvasX = e.clientX - rect.left;
      mouseCanvasY = e.clientY - rect.top;

      if (isDragging) {
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        targetRotY += deltaX * 0.007;
        targetRotX = Math.max(-0.85, Math.min(0.85, targetRotX - deltaY * 0.007));
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onMouseLeave = () => {
      isDragging = false;
      mouseCanvasX = -1000;
      mouseCanvasY = -1000;
      setHoveredHub(null);
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);

    // Coordinate conversion helper: lat/lon (degrees) -> 3D sphere (x,y,z)
    const latLonTo3D = (lat: number, lon: number, radius: number) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      const x = -(radius * Math.sin(phi) * Math.cos(theta));
      const z = radius * Math.sin(phi) * Math.sin(theta);
      const y = radius * Math.cos(phi);
      return { x, y, z };
    };

    // 3D rotation around X (pitch) and Y (yaw)
    const rotate3D = (x: number, y: number, z: number, rx: number, ry: number) => {
      // Rotate around Y
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;

      // Rotate around X
      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      return { x: x1, y: y2, z: z2 };
    };

    let animationTime = 0;

    const render = () => {
      animationTime += 0.015;

      // Smooth inertia
      if (!isDragging) {
        targetRotY += velocityY;
      }
      rotX += (targetRotX - rotX) * 0.08;
      rotY += (targetRotY - rotY) * 0.08;

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.38;

      ctx.clearRect(0, 0, width, height);

      // 1. Ambient Background Glow Behind Globe
      const radialGlow = ctx.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius * 1.35);
      radialGlow.addColorStop(0, "rgba(20, 184, 166, 0.14)");
      radialGlow.addColorStop(0.5, "rgba(13, 148, 136, 0.06)");
      radialGlow.addColorStop(1, "rgba(7, 11, 20, 0)");
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, width, height);

      // 2. Orbital Boundary Rings (Equator and Meridian guides)
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(45, 212, 191, 0.25)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Atmospheric outer ring halo
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.08, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(20, 184, 166, 0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // 3. Render Spherical Constellation Particles
      particles.forEach((p) => {
        const p3d = latLonTo3D(p.lat, p.lon, radius);
        const rotated = rotate3D(p3d.x, p3d.y, p3d.z, rotX, rotY);

        // Perspective scale & depth culling
        const depth = (rotated.z + radius) / (2 * radius); // 0 (back) to 1 (front)
        const scale = 0.6 + depth * 0.7;
        const px = centerX + rotated.x * scale;
        const py = centerY + rotated.y * scale;

        // Front-facing particles brighter, back-facing particles dimmer
        const alpha = rotated.z > 0 ? p.alpha * (0.4 + depth * 0.6) : p.alpha * 0.15;
        ctx.fillStyle = `rgba(148, 197, 240, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size * (0.8 + depth * 0.4), 0, Math.PI * 2);
        ctx.fill();
      });

      // 4. Project Hub Nodes onto 2D Plane
      const projectedHubs: (HubNode & { px: number; py: number; depth: number; visible: boolean })[] = [];
      let detectedHover: HubNode | null = null;

      GLOBAL_HUBS.forEach((hub) => {
        const h3d = latLonTo3D(hub.lat, hub.lon, radius);
        const rot = rotate3D(h3d.x, h3d.y, h3d.z, rotX, rotY);
        const depth = (rot.z + radius) / (2 * radius);
        const scale = 0.6 + depth * 0.7;
        const px = centerX + rot.x * scale;
        const py = centerY + rot.y * scale;
        const visible = rot.z > -radius * 0.25; // visible on front hemisphere

        projectedHubs.push({ ...hub, px, py, depth, visible });

        if (visible) {
          const dist = Math.hypot(px - mouseCanvasX, py - mouseCanvasY);
          if (dist < 18) {
            detectedHover = hub;
          }
        }
      });

      if (detectedHover !== hoveredHub) {
        setHoveredHub(detectedHover);
        if (detectedHover) {
          const h: HubNode = detectedHover;
          setTelemetry((prev) => ({
            ...prev,
            coords: `${Math.abs(h.lat).toFixed(4)}° ${h.lat >= 0 ? "N" : "S"}, ${Math.abs(h.lon).toFixed(4)}° ${h.lon >= 0 ? "E" : "W"}`,
          }));
        }
      }

      // 5. Draw Flight Trajectory Arcs (Great-Circle Elevated Beziers)
      FLIGHT_ROUTES.forEach((route, routeIdx) => {
        const fromHub = projectedHubs.find((h) => h.id === route.from);
        const toHub = projectedHubs.find((h) => h.id === route.to);
        if (!fromHub || !toHub) return;

        // Both nodes must be reasonably front-facing
        if (fromHub.visible || toHub.visible) {
          // Calculate midpoint elevated in 3D
          const midX = (fromHub.px + toHub.px) / 2;
          const midY = (fromHub.py + toHub.py) / 2;
          const dist = Math.hypot(toHub.px - fromHub.px, toHub.py - fromHub.py);

          // Arc bend height relative to globe center
          const arcHeight = Math.min(dist * 0.35, 65);
          const cpX = midX - ((centerY - midY) / radius) * arcHeight * 0.6;
          const cpY = midY - arcHeight;

          // Arc Line
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(fromHub.px, fromHub.py);
          ctx.quadraticCurveTo(cpX, cpY, toHub.px, toHub.py);

          const arcGrad = ctx.createLinearGradient(fromHub.px, fromHub.py, toHub.px, toHub.py);
          arcGrad.addColorStop(0, "rgba(20, 184, 166, 0.2)");
          arcGrad.addColorStop(0.5, "rgba(45, 212, 191, 0.75)");
          arcGrad.addColorStop(1, "rgba(56, 189, 248, 0.3)");
          ctx.strokeStyle = arcGrad;
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Animated Flight Photon traveling along the quadratic curve
          const progress = (animationTime * 0.45 + routeIdx * 0.22) % 1;
          const t = progress;
          // Quadratic Bezier Formula: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
          const photonX = (1 - t) * (1 - t) * fromHub.px + 2 * (1 - t) * t * cpX + t * t * toHub.px;
          const photonY = (1 - t) * (1 - t) * fromHub.py + 2 * (1 - t) * t * cpY + t * t * toHub.py;

          // Glowing photon head
          ctx.beginPath();
          ctx.arc(photonX, photonY, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.shadowColor = "#2DD4BF";
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Trailing pulse
          ctx.beginPath();
          ctx.arc(photonX, photonY, 6.5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(45, 212, 191, 0.28)";
          ctx.fill();

          ctx.restore();
        }
      });

      // 6. Draw Hub Markers & Labels
      projectedHubs.forEach((hub) => {
        if (!hub.visible) return;

        const isHovered = hoveredHub?.id === hub.id;
        const pointSize = isHovered ? 5.5 : 3.5 + hub.depth * 2;

        // Outer beacon ripple
        ctx.beginPath();
        ctx.arc(hub.px, hub.py, pointSize * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? "rgba(45, 212, 191, 0.45)" : "rgba(20, 184, 166, 0.2)";
        ctx.fill();

        // Solid core
        ctx.beginPath();
        ctx.arc(hub.px, hub.py, pointSize, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? "#FFFFFF" : "#14B8A6";
        ctx.fill();

        // City & Code Label
        ctx.font = isHovered ? "bold 11px 'Inter', sans-serif" : "600 10px 'Inter', sans-serif";
        ctx.fillStyle = isHovered ? "#FFFFFF" : "rgba(226, 232, 240, 0.85)";
        ctx.fillText(`${hub.code}`, hub.px + pointSize + 6, hub.py + 3.5);

        if (isHovered) {
          ctx.font = "9px 'Inter', sans-serif";
          ctx.fillStyle = "#2DD4BF";
          ctx.fillText(`${hub.city} · ${hub.activeRoutes} routes`, hub.px + pointSize + 6, hub.py + 15);
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [hoveredHub]);

  return (
    <div ref={containerRef} className="relative w-full h-[460px] sm:h-[540px] lg:h-[620px] select-none cursor-grab active:cursor-grabbing">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Futuristic Telemetry HUD Overlay */}
      <div className="absolute top-4 left-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 backdrop-blur-md text-[11px] font-mono space-y-1 shadow-xl pointer-events-none">
        <div className="flex items-center gap-2 text-teal-400 font-bold">
          <Radio size={12} className="animate-pulse" />
          <span>MOBILITY RADAR · ACTIVE</span>
        </div>
        <div className="text-slate-400 flex items-center justify-between gap-4">
          <span>COORDS</span>
          <span className="text-white font-semibold">{telemetry.coords}</span>
        </div>
        <div className="text-slate-400 flex items-center justify-between gap-4">
          <span>AIR HUBS</span>
          <span className="text-teal-300 font-semibold">{telemetry.hubCount} Gateways</span>
        </div>
        <div className="text-slate-400 flex items-center justify-between gap-4">
          <span>CORRIDORS</span>
          <span className="text-cyan-300 font-semibold">{telemetry.activeRoutes} Routes Active</span>
        </div>
      </div>

      {/* Security & SLA Badges Bottom Right */}
      <div className="absolute bottom-4 right-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 backdrop-blur-md text-[10.5px] space-y-1 text-right shadow-xl pointer-events-none">
        <div className="flex items-center justify-end gap-1.5 text-emerald-400 font-bold">
          <ShieldCheck size={13} />
          <span>TLS 1.3 · TENANT ISOLATION</span>
        </div>
        <p className="text-slate-400 font-mono text-[10px]">
          Fulfillment SLA: <strong className="text-white">&lt; 4h Ticketing</strong>
        </p>
      </div>

      {/* Interactive prompt hint */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-800 text-[10.5px] text-slate-400 backdrop-blur-md flex items-center gap-2 pointer-events-none">
        <Compass size={12} className="text-teal-400 animate-spin" style={{ animationDuration: "12s" }} />
        <span>Click & drag to rotate 3D sphere</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN LANDING PAGE COMPONENT
// ---------------------------------------------------------------------------
export function LandingPage({ onSignIn }: LandingPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Active Capability Module Switcher State
  const [activeCapability, setActiveCapability] = useState<
    "requests" | "approvals" | "travelDesk" | "bulk" | "archive" | "spend"
  >("requests");

  // Track scroll for sticky navbar styling
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
    <div className="min-h-screen bg-[#070A12] text-slate-100 font-sans selection:bg-teal-500 selection:text-white">
      {/* Precision Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-40 -left-40 w-[650px] h-[650px] rounded-full blur-[160px] opacity-20"
          style={{ background: "radial-gradient(circle, #14B8A6 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[700px] h-[700px] rounded-full blur-[180px] opacity-15"
          style={{ background: "radial-gradient(circle, #0D9488 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-10 left-1/4 w-[600px] h-[600px] rounded-full blur-[170px] opacity-15"
          style={{ background: "radial-gradient(circle, #0284C7 0%, transparent 70%)" }}
        />
        {/* Subtle Architectural Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* 1. STICKY ENTERPRISE NAVIGATION BAR */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 border-b ${
          scrolled
            ? "bg-[#070A12]/90 backdrop-blur-md border-slate-800/80 shadow-lg shadow-black/40"
            : "bg-[#070A12]/60 backdrop-blur-sm border-slate-800/40"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Brand Identity */}
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
              <span className="hidden sm:inline-flex items-center text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/30">
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
            <button onClick={() => scrollToSection("capabilities")} className="hover:text-teal-400 transition-colors">
              Capabilities
            </button>
            <button onClick={() => scrollToSection("how-it-works")} className="hover:text-teal-400 transition-colors">
              How It Works
            </button>
            <button onClick={() => scrollToSection("solutions")} className="hover:text-teal-400 transition-colors">
              Solutions
            </button>
            <button
              onClick={() => scrollToSection("intelligence")}
              className="hover:text-teal-400 transition-colors flex items-center gap-1.5"
            >
              <span>Spend Intelligence</span>
              <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">
                BI Live
              </span>
            </button>
            <button onClick={() => scrollToSection("architecture")} className="hover:text-teal-400 transition-colors">
              Architecture
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden sm:flex items-center gap-3.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-9 h-9 rounded-lg border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <button
              type="button"
              onClick={onSignIn}
              className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-bold text-sm tracking-wide shadow-md shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/30 transition-all duration-150 cursor-pointer"
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
                onClick={() => scrollToSection("capabilities")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800/80"
              >
                Capabilities
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
                Spend Intelligence
              </button>
              <button
                onClick={() => scrollToSection("architecture")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800/80"
              >
                Architecture
              </button>
            </div>
            <div className="pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSignIn();
                }}
                className="w-full py-3 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20"
              >
                <Lock size={15} />
                <span>Sign In to Portal</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION — CINEMATIC AWWWARDS CALIBER WITH 3D ORBITAL GLOBE */}
      <section id="hero" className="relative z-10 pt-10 pb-20 md:pt-16 md:pb-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            {/* Hero Left: Master Editorial Headline & Actions */}
            <div className="lg:col-span-6 space-y-7 text-center lg:text-left">
              {/* Product Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase bg-teal-500/10 text-teal-400 border border-teal-500/30 shadow-xs">
                <Sparkles size={13} className="text-teal-400" />
                <span>Enterprise Corporate Mobility Platform</span>
              </div>

              {/* Exact User Requested Main Headline */}
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.08] font-['Outfit',sans-serif]">
                Corporate Travel.{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-teal-300 to-cyan-400">
                  Reimagined.
                </span>
              </h1>

              {/* Exact User Requested Supporting Text */}
              <p className="text-slate-300 text-base sm:text-xl leading-relaxed max-w-xl mx-auto lg:mx-0 font-normal">
                One intelligent platform to manage every journey, approval, booking and travel expense.
              </p>

              {/* Primary & Secondary Call-to-Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-bold text-sm tracking-wide shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40 hover:-translate-y-0.5 transition-all duration-150 flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <Lock size={16} />
                  <span>Sign In to Platform</span>
                  <ArrowRight size={17} />
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection("capabilities")}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-lg border border-slate-700/80 hover:border-slate-600 bg-slate-900/60 hover:bg-slate-800/80 text-slate-200 font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <SlidersHorizontal size={15} className="text-teal-400" />
                  <span>Explore Capabilities</span>
                </button>
              </div>

              {/* Enterprise Performance Strip */}
              <div className="pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
                <div>
                  <div className="text-xl font-extrabold text-white font-mono tracking-tight">&lt; 4h</div>
                  <div className="text-[11px] text-slate-400 font-medium">Fulfillment SLA</div>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-teal-400 font-mono tracking-tight">100%</div>
                  <div className="text-[11px] text-slate-400 font-medium">Audit Compliance</div>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-cyan-400 font-mono tracking-tight">0</div>
                  <div className="text-[11px] text-slate-400 font-medium">Lost Receipts</div>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-white font-mono tracking-tight">Multi-Tenant</div>
                  <div className="text-[11px] text-slate-400 font-medium">Data Segregation</div>
                </div>
              </div>
            </div>

            {/* Hero Right: 3D Interactive Corridor Canvas */}
            <div className="lg:col-span-6 relative">
              <div className="relative mx-auto max-w-lg lg:max-w-none rounded-2xl border border-slate-800/90 bg-[#0A0E1A]/90 shadow-2xl backdrop-blur-xl overflow-hidden">
                <Interactive3DCorridorGlobe />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. CAPABILITIES SHOWCASE WORKBENCH (THE 6 CORE MODULES) */}
      <section id="capabilities" className="relative z-10 py-24 bg-[#090D18]/90 border-y border-slate-800/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
              Trapple Core Systems
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Six Purpose-Built Engines for Enterprise Mobility
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Explore the exact architecture and workflows engineered into Trapple. Toggle each capability below to
              inspect its live workstation preview.
            </p>
          </div>

          {/* Interactive Module Navigation Bar */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
            {[
              { id: "requests", label: "Travel Management", icon: Plane },
              { id: "approvals", label: "Approval Workflows", icon: ShieldCheck },
              { id: "travelDesk", label: "Travel Desk Operations", icon: TicketCheck },
              { id: "bulk", label: "Bulk Travel", icon: UsersRound },
              { id: "archive", label: "Travel History & Archive", icon: FileSpreadsheet },
              { id: "spend", label: "Corporate Spend Analytics", icon: BarChart3 },
            ].map((module) => {
              const Icon = module.icon;
              const isActive = activeCapability === module.id;
              return (
                <button
                  key={module.id}
                  onClick={() => setActiveCapability(module.id as any)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "bg-teal-500 text-white shadow-md shadow-teal-500/25"
                      : "bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                  }`}
                >
                  <Icon size={15} />
                  <span>{module.label}</span>
                </button>
              );
            })}
          </div>

          {/* Workbench Preview Display Window */}
          <div className="rounded-xl border border-slate-800 bg-[#0E131F] shadow-2xl overflow-hidden">
            {/* Terminal / Workstation Window Chrome */}
            <div className="px-5 py-3.5 bg-[#0B0F19] border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-mono text-[11px] text-slate-400 font-semibold flex items-center gap-1.5 pl-2 border-l border-slate-800">
                  <Lock size={12} className="text-teal-400" /> trapple.enterprise/modules/{activeCapability}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Verified System Preview</span>
              </div>
            </div>

            {/* Dynamic Interactive Preview Body */}
            <div className="p-6 lg:p-8">
              {/* 1. TRAVEL MANAGEMENT */}
              {activeCapability === "requests" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5 space-y-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                      Module 01 · Self-Service Intake
                    </span>
                    <h3 className="text-2xl font-bold text-white">Travel Request Management</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Employees can submit corporate travel requests with origin, destination, multi-city legs, project
                      cost codes, and accommodation requirements in under 60 seconds.
                    </p>
                    <ul className="space-y-2.5 text-xs text-slate-300">
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Pre-configured domestic flight and rail policies</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Instant cost center and client project allocation</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Real-time status tracking with automated manager notifications</span>
                      </li>
                    </ul>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="rounded-xl border border-slate-800 bg-[#070A12] p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400 block">
                            Trip Planner Form
                          </span>
                          <strong className="text-sm text-white">Submit Travel Parameters</strong>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/30">
                          Policy: Economy Class
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-slate-400 text-[10px] block mb-1">Departure Sector</span>
                          <strong className="text-white flex items-center gap-1.5">
                            <Plane size={13} className="text-teal-400" /> New Delhi (DEL)
                          </strong>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-slate-400 text-[10px] block mb-1">Arrival Sector</span>
                          <strong className="text-white flex items-center gap-1.5">
                            <Plane size={13} className="text-teal-400" /> Mumbai (BOM)
                          </strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800">
                          <span className="text-slate-500 text-[9.5px] block">Travel Date</span>
                          <strong className="text-slate-200 font-mono text-[11px]">18 Nov 2026</strong>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800">
                          <span className="text-slate-500 text-[9.5px] block">Project Code</span>
                          <strong className="text-teal-300 font-mono text-[11px]">PRJ-INFRA-402</strong>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800">
                          <span className="text-slate-500 text-[9.5px] block">Est. Cost</span>
                          <strong className="text-emerald-400 font-mono text-[11px]">₹6,800</strong>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                        <CheckCircle2 size={15} className="shrink-0" />
                        <span>In-Policy: Advance notice &gt; 7 days, within department ceiling.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. APPROVAL WORKFLOWS */}
              {activeCapability === "approvals" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5 space-y-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                      Module 02 · Rapid Decision Cockpit
                    </span>
                    <h3 className="text-2xl font-bold text-white">Approval Workflows</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Managers review pending travel requests with side-by-side context: employee historical travel spend,
                      annual budget consumption, policy compliance, and 1-click approvals.
                    </p>
                    <ul className="space-y-2.5 text-xs text-slate-300">
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Side-by-side traveler profile and previous trip ledger</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>One-click authorize or decline with mandatory remarks</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Instant notification dispatched to Travel Desk for fulfillment</span>
                      </li>
                    </ul>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="rounded-xl border border-slate-800 bg-[#070A12] p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-xs">
                            RS
                          </div>
                          <div>
                            <strong className="text-sm text-white block">Rajesh Sharma</strong>
                            <span className="text-[10px] text-slate-400">Sr. Project Engineer · MISPL0042</span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          Awaiting Sign-off
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Sector Route</span>
                          <strong className="text-white font-mono">DEL ✈ BOM (Return)</strong>
                          <span className="text-slate-500 text-[10px] block mt-0.5">Client Site Technical Audit</span>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Traveler YTD Spend</span>
                          <strong className="text-emerald-400 font-mono">₹48,200 (4 Trips)</strong>
                          <span className="text-slate-500 text-[10px] block mt-0.5">Budget Variance: -14%</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="button"
                          className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Check size={14} /> Authorize Request
                        </button>
                        <button
                          type="button"
                          className="px-4 py-2.5 rounded-lg border border-rose-900/60 bg-rose-950/20 text-rose-400 hover:bg-rose-950/40 font-bold text-xs flex items-center justify-center gap-1.5"
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. TRAVEL DESK OPERATIONS */}
              {activeCapability === "travelDesk" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5 space-y-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                      Module 03 · Operational Command
                    </span>
                    <h3 className="text-2xl font-bold text-white">Travel Desk Operations</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      The centralized mission control for enterprise travel coordinators to fulfill flights, allocate PNR
                      numbers, attach PDF e-tickets, and reconcile supplier invoices.
                    </p>
                    <ul className="space-y-2.5 text-xs text-slate-300">
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Urgent departures queue with automated &lt; 24h escalation flags</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Direct PNR booking reference and carrier voucher uploads</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Structured modification, cancellation, and refund accounting</span>
                      </li>
                    </ul>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="rounded-xl border border-slate-800 bg-[#070A12] p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <TicketCheck size={16} className="text-teal-400" />
                          <strong className="text-sm text-white">Booking Fulfillment Console</strong>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                          PNR: 6E-88219 ISSUED
                        </span>
                      </div>

                      <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <strong className="text-white font-mono">IndiGo 6E-2041 · Seat 12F</strong>
                          <span className="text-teal-300 font-mono font-bold">Fare: ₹6,420</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                          <span>Departure: 14 Nov 08:30 AM · T3 DEL</span>
                          <span>Arrival: 14 Nov 10:45 AM · T2 BOM</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-slate-800 text-xs">
                        <div className="flex items-center gap-2.5">
                          <FileText size={18} className="text-rose-400" />
                          <div>
                            <strong className="text-slate-200 block text-[11.5px]">indigo_eticket_6E88219.pdf</strong>
                            <span className="text-slate-500 text-[10px]">E-Ticket Document Attached</span>
                          </div>
                        </div>
                        <span className="text-[10.5px] font-semibold text-teal-400 flex items-center gap-1">
                          <Download size={13} /> Verified
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. BULK TRAVEL */}
              {activeCapability === "bulk" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5 space-y-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                      Module 04 · Large Movement Logistics
                    </span>
                    <h3 className="text-2xl font-bold text-white">Bulk and Group Travel</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Coordinate site mobilizations, conferences, and multi-employee movements with consolidated passenger
                      manifests and bulk ticketing workflows.
                    </p>
                    <ul className="space-y-2.5 text-xs text-slate-300">
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Multi-traveler manifests linked to single corporate projects</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Bulk CSV/Excel traveler roster intake with automatic role validation</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Consolidated manifest downloads for airline and bus charter bookings</span>
                      </li>
                    </ul>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="rounded-xl border border-slate-800 bg-[#070A12] p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400 block">
                            Group Movement
                          </span>
                          <strong className="text-sm text-white">Kalinganagar Project Mobilization</strong>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/30">
                          28 Travelers
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        {[
                          { name: "Prakash Verma", id: "MISPL0081", role: "Site Supervisor", seat: "Coach B2-24" },
                          { name: "Amitabh Roy", id: "MISPL0092", role: "Safety Auditor", seat: "Coach B2-25" },
                          { name: "Suresh Pillai", id: "MISPL0104", role: "Piping Lead", seat: "Coach B2-26" },
                        ].map((traveler) => (
                          <div
                            key={traveler.id}
                            className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 flex items-center justify-between"
                          >
                            <div>
                              <strong className="text-slate-200 block">{traveler.name}</strong>
                              <span className="text-slate-500 text-[10px]">
                                {traveler.id} · {traveler.role}
                              </span>
                            </div>
                            <span className="font-mono text-teal-300 text-[11px]">{traveler.seat}</span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>Total Roster: 28 Passengers Confirmed</span>
                        <span className="text-teal-400 font-bold flex items-center gap-1 cursor-pointer">
                          <Download size={13} /> Export Group Manifest
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. HISTORICAL TRAVEL INTELLIGENCE */}
              {activeCapability === "archive" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5 space-y-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                      Module 05 · Corporate Memory
                    </span>
                    <h3 className="text-2xl font-bold text-white">Historical Travel Intelligence</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Import years of historical travel spreadsheets and combine them with live platform requests for an
                      immutable, fully searchable corporate travel archive.
                    </p>
                    <ul className="space-y-2.5 text-xs text-slate-300">
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Full-text employee search with instant travel ledger inspection</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Excel spreadsheet importer with intelligent column mapping</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Audit-ready export for financial accounting and tax compliance</span>
                      </li>
                    </ul>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="rounded-xl border border-slate-800 bg-[#070A12] p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <Search size={15} className="text-teal-400" />
                          <strong className="text-sm text-white">Historical Employee Ledger</strong>
                        </div>
                        <span className="text-[10px] font-mono text-teal-400">2,480 Records Indexed</span>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold">
                            VS
                          </div>
                          <div>
                            <strong className="text-white block">Vikas Sharma</strong>
                            <span className="text-slate-400 text-[10px]">MISPL0042 · Senior Manager (Projects)</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Total Expenditure</span>
                          <strong className="text-emerald-400 font-mono">₹1,42,850</strong>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-800 overflow-hidden text-[11px]">
                        <div className="bg-slate-900 px-3 py-2 text-slate-400 font-semibold grid grid-cols-4">
                          <span>DATE</span>
                          <span>ROUTE</span>
                          <span>MODE</span>
                          <span className="text-right">FARE</span>
                        </div>
                        <div className="divide-y divide-slate-800/80 bg-slate-950/40">
                          <div className="px-3 py-2 grid grid-cols-4 text-slate-300">
                            <span>12 Oct 2026</span>
                            <span className="font-mono text-white">DEL ✈ BLR</span>
                            <span>Flight</span>
                            <span className="text-right font-mono">₹7,200</span>
                          </div>
                          <div className="px-3 py-2 grid grid-cols-4 text-slate-300">
                            <span>24 Sep 2026</span>
                            <span className="font-mono text-white">DEL ✈ BOM</span>
                            <span>Flight</span>
                            <span className="text-right font-mono">₹5,900</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. CORPORATE SPEND ANALYTICS */}
              {activeCapability === "spend" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5 space-y-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                      Module 06 · Executive Fiscal Intelligence
                    </span>
                    <h3 className="text-2xl font-bold text-white">Corporate Spend Analytics</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Gain complete visibility into enterprise mobility spend: department distributions, high-frequency
                      sectors, cost per passenger kilometer, and month-on-month trendlines.
                    </p>
                    <ul className="space-y-2.5 text-xs text-slate-300">
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Department burn rate and fiscal quarter tracking</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Top corporate airline and hotel supplier volume analysis</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={14} className="text-teal-400" />
                        <span>Direct synchronization with backend spend intelligence APIs</span>
                      </li>
                    </ul>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="rounded-xl border border-slate-800 bg-[#070A12] p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <BarChart3 size={16} className="text-teal-400" />
                          <strong className="text-sm text-white">Executive BI Dashboard</strong>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">FY 2025-26 Year-to-Date</span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Total Expenditure</span>
                          <strong className="text-emerald-400 font-mono text-base">₹42.8L</strong>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Avg. Cost / Trip</span>
                          <strong className="text-white font-mono text-base">₹6,420</strong>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Total Journeys</span>
                          <strong className="text-teal-300 font-mono text-base">668</strong>
                        </div>
                      </div>

                      {/* Spend Distribution Bar Breakdown */}
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Department Spend Distribution</span>
                          <span className="font-mono text-teal-400">100% Allocated</span>
                        </div>
                        <div className="h-3 rounded-full bg-slate-800 overflow-hidden flex">
                          <div className="bg-teal-500 h-full" style={{ width: "46%" }} title="Operations (46%)" />
                          <div className="bg-cyan-500 h-full" style={{ width: "32%" }} title="Engineering (32%)" />
                          <div className="bg-emerald-500 h-full" style={{ width: "22%" }} title="Executive (22%)" />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-teal-500" /> Operations (₹19.6L)
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-500" /> Projects (₹13.7L)
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Executive (₹9.5L)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. PROBLEM & SOLUTION SECTION */}
      <section id="solutions" className="relative z-10 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
              The Enterprise Problem & Solution
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Why Growing Businesses Outgrow Email and Spreadsheets
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              When employee movements are scattered across WhatsApp messages, emails, phone calls, and offline travel
              agents, businesses suffer high operational friction and untracked financial leakage.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            {/* The Old Way: Fragmented Problems */}
            <div className="rounded-xl border border-rose-900/40 bg-gradient-to-b from-rose-950/20 to-slate-950/60 p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-rose-900/40 pb-4">
                <div className="w-10 h-10 rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center font-bold">
                  <X size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">The Fragmented Approach</h3>
                  <span className="text-xs text-rose-300">Bottlenecks, hidden fees, and zero policy control</span>
                </div>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="text-rose-400 font-bold shrink-0 mt-0.5">✕</span>
                  <div>
                    <strong className="text-white block font-semibold">Unorganized employee travel requests</strong>
                    <span className="text-slate-400 text-xs">
                      Requests arrive via WhatsApp, personal email, or hallway conversations with incomplete details.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-rose-400 font-bold shrink-0 mt-0.5">✕</span>
                  <div>
                    <strong className="text-white block font-semibold">Manual, delayed approval processes</strong>
                    <span className="text-slate-400 text-xs">
                      Approvers are overwhelmed without budget context, delaying ticketing until airfares double.
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
              </div>
            </div>

            {/* The Trapple Way: Centralized Solution */}
            <div className="rounded-xl border border-teal-500/40 bg-gradient-to-b from-teal-950/25 to-slate-950/60 p-6 sm:p-8 space-y-6 shadow-xl shadow-teal-950/20">
              <div className="flex items-center gap-3 border-b border-teal-500/30 pb-4">
                <div className="w-10 h-10 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
                  <Check size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">The Trapple Standard</h3>
                  <span className="text-xs text-teal-300">Centralized corporate mobility on one unified platform</span>
                </div>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="text-teal-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div>
                    <strong className="text-white block font-semibold">One Centralized Request Desk</strong>
                    <span className="text-slate-400 text-xs">
                      Employees submit structured requests with travel dates, project codes, and preferred modes in under
                      60 seconds.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-teal-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div>
                    <strong className="text-white block font-semibold">Automated Approval Cockpit</strong>
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
                      Travel desk coordinators fulfill flights, trains, and hotels, attaching tickets and live PNRs
                      directly to the journey.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-teal-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div>
                    <strong className="text-white block font-semibold">Live Authoritative Spend Visibility</strong>
                    <span className="text-slate-400 text-xs">
                      Real-time aggregation of booking fares, department allocations, and fiscal year spend
                      distributions.
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
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS WORKFLOW SECTION */}
      <section id="how-it-works" className="relative z-10 py-24 bg-[#090D18]/90 border-y border-slate-800/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
              Enterprise Lifecycle
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              How Trapple Powers Corporate Travel in Four Steps
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              From employee departure submission to executive financial audit, Trapple keeps every stakeholder synchronized.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Submit Request",
                desc: "Employees submit their travel route, dates, purpose, and project code via self-service portal.",
                icon: Plane,
              },
              {
                step: "02",
                title: "Authorize & Review",
                desc: "Approvers review with side-by-side employee travel spend context, policy status, and one-click actions.",
                icon: ShieldCheck,
              },
              {
                step: "03",
                title: "Travel Desk Ticketing",
                desc: "Coordinators issue confirmed airline PNRs or train tickets, attaching PDF vouchers directly.",
                icon: TicketCheck,
              },
              {
                step: "04",
                title: "Fiscal Intelligence",
                desc: "Management reviews department travel expenditure, top routes, and audits historical records.",
                icon: BarChart3,
              },
            ].map((st) => {
              const Icon = st.icon;
              return (
                <div
                  key={st.step}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 relative flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-2xl font-black text-teal-400">{st.step}</span>
                      <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                        <Icon size={18} />
                      </div>
                    </div>
                    <h3 className="text-base font-bold text-white">{st.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{st.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. TRAVEL SPEND INTELLIGENCE SECTION */}
      <section id="intelligence" className="relative z-10 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
                Financial Architecture
              </span>
              <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
                Every Trip Tells a Story. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400">
                  Every Expense Matters.
                </span>
              </h2>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Trapple connects operational travel requests with backend accounting records to produce unified spend
                intelligence. Boardrooms and CFOs gain immediate clarity into corporate mobility burn rates.
              </p>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1">
                  <strong className="text-white block font-semibold">Department Breakdown</strong>
                  <span className="text-slate-400 text-[11.5px]">Analyze quarterly budget burn across business units.</span>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1">
                  <strong className="text-white block font-semibold">Destination Frequency</strong>
                  <span className="text-slate-400 text-[11.5px]">Identify top travel corridors to negotiate airline volume rates.</span>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1">
                  <strong className="text-white block font-semibold">Employee Ledger</strong>
                  <span className="text-slate-400 text-[11.5px]">Instant chronological trip audit for any employee ID.</span>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1">
                  <strong className="text-white block font-semibold">Real Data Only</strong>
                  <span className="text-slate-400 text-[11.5px]">Zero fabricated data. Backed by transactional ledger records.</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-xl border border-slate-800 bg-[#0B0F19] p-6 space-y-5 shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400">Fiscal Trends</span>
                    <h4 className="text-sm font-bold text-white">Month-on-Month Corporate Expenditure</h4>
                  </div>
                  <span className="font-mono text-xs text-emerald-400 font-bold">FY 2025-26</span>
                </div>

                {/* Illustrated Bar Visualizer */}
                <div className="h-44 flex items-end gap-2 pt-4 px-2">
                  {[
                    { m: "Apr", val: 55, cost: "₹2.8L" },
                    { m: "May", val: 68, cost: "₹3.4L" },
                    { m: "Jun", val: 48, cost: "₹2.4L" },
                    { m: "Jul", val: 82, cost: "₹4.1L" },
                    { m: "Aug", val: 75, cost: "₹3.8L" },
                    { m: "Sep", val: 92, cost: "₹4.6L" },
                    { m: "Oct", val: 85, cost: "₹4.3L" },
                    { m: "Nov", val: 100, cost: "₹5.0L" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                      <div
                        className="w-full bg-gradient-to-t from-teal-600/40 via-teal-500/70 to-teal-400 rounded-t-sm group-hover:to-teal-300 transition-all duration-200"
                        style={{ height: `${item.val}%` }}
                      />
                      <span className="text-[10px] font-mono text-slate-400">{item.m}</span>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Total YTD Combined Spend</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">₹30,40,000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. ARCHITECTURE & MULTI-TENANCY SECTION */}
      <section id="architecture" className="relative z-10 py-24 bg-[#090D18]/90 border-t border-slate-800/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/25">
              Infrastructure & Governance
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Enterprise Security and Role-Based Portals
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Engineered with strict tenant isolation, role-based access control (RBAC), and secure JWT authentication.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <Plane size={20} />
              </div>
              <h3 className="text-base font-bold text-white">Employee Portal</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Submit corporate travel requests, track approval status, and access confirmed e-tickets and boarding passes.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <ShieldCheck size={20} />
              </div>
              <h3 className="text-base font-bold text-white">Approver Portal</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Review pending requests, examine employee travel spend history, verify budget limits, and authorize trips.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <TicketCheck size={20} />
              </div>
              <h3 className="text-base font-bold text-white">Travel Desk Portal</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Coordinate airline and railway bookings, upload ticket PDFs, manage bulk manifests, and process cancellations.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <Building2 size={20} />
              </div>
              <h3 className="text-base font-bold text-white">Admin & Platform Portal</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Oversee multi-tenant organizations, manage user roles and permissions, monitor system health, and audit logs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 8. CALL TO ACTION STRIP */}
      <section className="relative z-10 py-20 bg-gradient-to-b from-[#090D18] to-[#070A12] border-t border-slate-800">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Ready to Transform Your Corporate Mobility?
          </h2>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto">
            Experience the enterprise standard in business travel management. Sign in to your corporate portal now.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onSignIn}
              className="px-8 py-4 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-bold text-sm tracking-wide shadow-xl shadow-teal-500/30 hover:-translate-y-0.5 transition-all duration-150 inline-flex items-center gap-2.5 cursor-pointer"
            >
              <Lock size={16} />
              <span>Sign In to Platform</span>
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {/* 9. ENTERPRISE FOOTER */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-[#05080E] py-12 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
              <Plane size={16} />
            </div>
            <span className="font-extrabold text-lg text-white font-['Outfit',sans-serif]">trapple</span>
            <span className="text-[11px] text-slate-500">· Corporate Mobility Engine</span>
          </div>

          <div className="flex items-center gap-6 text-slate-400">
            <button onClick={() => scrollToSection("capabilities")} className="hover:text-white transition-colors">
              Capabilities
            </button>
            <button onClick={() => scrollToSection("how-it-works")} className="hover:text-white transition-colors">
              Workflow
            </button>
            <button onClick={() => scrollToSection("intelligence")} className="hover:text-white transition-colors">
              Spend Intelligence
            </button>
            <button onClick={onSignIn} className="hover:text-teal-400 transition-colors font-semibold">
              Sign In
            </button>
          </div>

          <p className="text-[11px] text-slate-500">
            © {new Date().getFullYear()} Trapple Inc. All rights reserved. Enterprise edition.
          </p>
        </div>
      </footer>
    </div>
  );
}
