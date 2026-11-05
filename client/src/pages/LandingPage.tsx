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
import { WORLD_COASTLINES, WORLD_LAND_POINTS } from "@/components/worldData";

interface LandingPageProps {
  onSignIn: () => void;
}

// ---------------------------------------------------------------------------
// PHOTOREALISTIC 3D EARTH GLOBE & CORRIDOR RADAR
// Natural Earth vector continents, Rayleigh atmospheric glow, city light matrix & SLERP flight arcs
// ---------------------------------------------------------------------------
interface HubNode {
  id: string;
  code: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  activeRoutes: number;
}

const GLOBAL_HUBS: HubNode[] = [
  { id: "del", code: "DEL", city: "New Delhi", country: "India", lat: 28.6139, lon: 77.209, activeRoutes: 42 },
  { id: "bom", code: "BOM", city: "Mumbai", country: "India", lat: 19.076, lon: 72.8777, activeRoutes: 48 },
  { id: "blr", code: "BLR", city: "Bengaluru", country: "India", lat: 12.9716, lon: 77.5946, activeRoutes: 36 },
  { id: "hyd", code: "HYD", city: "Hyderabad", country: "India", lat: 17.2403, lon: 78.4294, activeRoutes: 28 },
  { id: "dxb", code: "DXB", city: "Dubai", country: "UAE", lat: 25.2048, lon: 55.2708, activeRoutes: 34 },
  { id: "sin", code: "SIN", city: "Singapore", country: "Singapore", lat: 1.3521, lon: 103.8198, activeRoutes: 30 },
  { id: "lhr", code: "LHR", city: "London", country: "UK", lat: 51.47, lon: -0.4543, activeRoutes: 28 },
  { id: "fra", code: "FRA", city: "Frankfurt", country: "Germany", lat: 50.0379, lon: 8.5622, activeRoutes: 22 },
  { id: "hnd", code: "HND", city: "Tokyo", country: "Japan", lat: 35.5494, lon: 139.7798, activeRoutes: 24 },
  { id: "jfk", code: "JFK", city: "New York", country: "USA", lat: 40.6413, lon: -73.7781, activeRoutes: 24 },
  { id: "sfo", code: "SFO", city: "San Francisco", country: "USA", lat: 37.6213, lon: -122.379, activeRoutes: 18 },
  { id: "syd", code: "SYD", city: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093, activeRoutes: 16 },
];

const FLIGHT_ROUTES = [
  { from: "del", to: "bom", code: "TRP-204", carrier: "IndiGo 6E" },
  { from: "del", to: "blr", code: "TRP-812", carrier: "Air India AI" },
  { from: "bom", to: "hyd", code: "TRP-415", carrier: "Vistara UK" },
  { from: "bom", to: "dxb", code: "TRP-901", carrier: "Emirates EK" },
  { from: "del", to: "dxb", code: "TRP-908", carrier: "Emirates EK" },
  { from: "del", to: "lhr", code: "TRP-115", carrier: "Virgin Atlantic" },
  { from: "fra", to: "del", code: "TRP-760", carrier: "Lufthansa LH" },
  { from: "blr", to: "sin", code: "TRP-302", carrier: "Singapore Airlines" },
  { from: "dxb", to: "lhr", code: "TRP-007", carrier: "British Airways" },
  { from: "lhr", to: "jfk", code: "TRP-001", carrier: "British Airways" },
  { from: "jfk", to: "sfo", code: "TRP-450", carrier: "Delta Air Lines" },
  { from: "sin", to: "hnd", code: "TRP-632", carrier: "All Nippon NH" },
  { from: "sin", to: "syd", code: "TRP-211", carrier: "Qantas QF" },
];

// 3D Math Utilities
function latLonToUnitVector(latDeg: number, lonDeg: number) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return {
    x: Math.cos(lat) * Math.sin(lon),
    y: -Math.sin(lat), // screen Y is downwards
    z: Math.cos(lat) * Math.cos(lon),
  };
}

function rotate3DVector(
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number
): { x: number; y: number; z: number } {
  // Rotate around Y axis (yaw/longitude)
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x1 = x * cosY + z * sinY;
  const z1 = -x * sinY + z * cosY;
  const y1 = y;

  // Rotate around X axis (pitch/latitude tilt)
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y2 = y1 * cosX - z1 * sinX;
  const z2 = y1 * sinX + z1 * cosX;
  const x2 = x1;

  return { x: x2, y: y2, z: z2 };
}

function projectGlobePoint(
  lat: number,
  lon: number,
  radius: number,
  rx: number,
  ry: number
) {
  const u = latLonToUnitVector(lat, lon);
  return rotate3DVector(u.x * radius, u.y * radius, u.z * radius, rx, ry);
}

function Interactive3DCorridorGlobe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredHub, setHoveredHub] = useState<HubNode | null>(null);
  const [telemetry, setTelemetry] = useState({
    coords: "28.6139° N, 77.2090° E",
    hubCount: GLOBAL_HUBS.length,
    activeRoutes: FLIGHT_ROUTES.length,
    speed: "1.0x LIVE",
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
    // Initial camera: tilt ~18° north, facing India / Middle East
    let rotX = 0.28;
    let rotY = -1.35;
    let targetRotX = rotX;
    let targetRotY = rotY;
    const autoVelocityY = 0.0022; // smooth earth rotation speed
    let mouseCanvasX = -2000;
    let mouseCanvasY = -2000;

    // Resize handling with devicePixelRatio for ultra-sharp canvas rendering
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        targetRotY += deltaX * 0.006;
        targetRotX = Math.max(-0.95, Math.min(0.95, targetRotX - deltaY * 0.006));
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onMouseLeave = () => {
      isDragging = false;
      mouseCanvasX = -2000;
      mouseCanvasY = -2000;
      setHoveredHub(null);
    };

    // Mobile touch support
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        const rect = canvas.getBoundingClientRect();
        mouseCanvasX = e.touches[0].clientX - rect.left;
        mouseCanvasY = e.touches[0].clientY - rect.top;
        const deltaX = e.touches[0].clientX - lastMouseX;
        const deltaY = e.touches[0].clientY - lastMouseY;
        targetRotY += deltaX * 0.007;
        targetRotX = Math.max(-0.95, Math.min(0.95, targetRotX - deltaY * 0.007));
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
      }
    };

    const onTouchEnd = () => {
      isDragging = false;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    let animationTime = 0;

    const render = () => {
      animationTime += 0.016;

      // Inertia and continuous slow rotation
      if (!isDragging) {
        targetRotY += autoVelocityY;
      }
      rotX += (targetRotX - rotX) * 0.08;
      rotY += (targetRotY - rotY) * 0.08;

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.39;

      ctx.clearRect(0, 0, width, height);

      // -------------------------------------------------------------
      // 1. COSMIC SPACE AURA & ATMOSPHERIC CORONA (BEHIND GLOBE)
      // -------------------------------------------------------------
      const outerCorona = ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.88,
        centerX,
        centerY,
        radius * 1.38
      );
      outerCorona.addColorStop(0, "rgba(45, 212, 191, 0.28)");
      outerCorona.addColorStop(0.25, "rgba(14, 165, 233, 0.16)");
      outerCorona.addColorStop(0.65, "rgba(6, 182, 212, 0.04)");
      outerCorona.addColorStop(1, "rgba(6, 182, 212, 0)");
      ctx.fillStyle = outerCorona;
      ctx.fillRect(0, 0, width, height);

      // -------------------------------------------------------------
      // 2. VOLUMETRIC OCEAN SPHERE (SUNLIT SHADING & TERMINATOR)
      // -------------------------------------------------------------
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.clip();

      // Sunlit specular gradient from top-left to shadow abyss on bottom-right
      const sunOffsetX = centerX - radius * 0.35;
      const sunOffsetY = centerY - radius * 0.38;
      const oceanGrad = ctx.createRadialGradient(
        sunOffsetX,
        sunOffsetY,
        radius * 0.05,
        centerX,
        centerY,
        radius * 1.05
      );
      oceanGrad.addColorStop(0, "#0E3A5A"); // Illuminated turquoise sunlit surface
      oceanGrad.addColorStop(0.3, "#082238"); // Deep azure oceanic shelf
      oceanGrad.addColorStop(0.6, "#041424"); // Midnight deep ocean crust
      oceanGrad.addColorStop(0.85, "#020B14"); // Day/Night terminator boundary
      oceanGrad.addColorStop(1, "#010408"); // Abyssal night side
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

      // -------------------------------------------------------------
      // 3. 3D LATITUDE & LONGITUDE NAVIGATIONAL GRATICULE
      // -------------------------------------------------------------
      // Parallels (Equator, Tropics, and polar circles)
      const parallels = [-60, -45, -23.44, 0, 23.44, 45, 60];
      parallels.forEach((lat) => {
        const isEquator = lat === 0;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = isEquator ? "rgba(45, 212, 191, 0.35)" : "rgba(56, 189, 248, 0.12)";
        ctx.lineWidth = isEquator ? 1.4 : 0.8;
        if (isEquator) ctx.setLineDash([4, 4]);

        let pathStarted = false;
        for (let lon = -180; lon <= 180; lon += 4) {
          const p = projectGlobePoint(lat, lon, radius, rotX, rotY);
          if (p.z >= 0) {
            if (!pathStarted) {
              ctx.moveTo(centerX + p.x, centerY + p.y);
              pathStarted = true;
            } else {
              ctx.lineTo(centerX + p.x, centerY + p.y);
            }
          } else {
            pathStarted = false;
          }
        }
        ctx.stroke();
        ctx.restore();
      });

      // Meridians (every 30 degrees)
      for (let lon = -180; lon < 180; lon += 30) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.10)";
        ctx.lineWidth = 0.8;
        let pathStarted = false;
        for (let lat = -80; lat <= 80; lat += 4) {
          const p = projectGlobePoint(lat, lon, radius, rotX, rotY);
          if (p.z >= 0) {
            if (!pathStarted) {
              ctx.moveTo(centerX + p.x, centerY + p.y);
              pathStarted = true;
            } else {
              ctx.lineTo(centerX + p.x, centerY + p.y);
            }
          } else {
            pathStarted = false;
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // -------------------------------------------------------------
      // 4. REAL NATURAL EARTH CONTINENTS (VECTOR COASTLINES)
      // -------------------------------------------------------------
      // First pass: Continental atmospheric luminous halo
      ctx.save();
      ctx.strokeStyle = "rgba(20, 184, 166, 0.18)";
      ctx.lineWidth = 3.2;
      for (let r = 0; r < WORLD_COASTLINES.length; r++) {
        const ring = WORLD_COASTLINES[r];
        ctx.beginPath();
        let pathStarted = false;
        for (let i = 0; i < ring.length - 1; i++) {
          const p1 = projectGlobePoint(ring[i][0], ring[i][1], radius, rotX, rotY);
          const p2 = projectGlobePoint(ring[i + 1][0], ring[i + 1][1], radius, rotX, rotY);

          if (p1.z >= 0 && p2.z >= 0) {
            if (!pathStarted) {
              ctx.moveTo(centerX + p1.x, centerY + p1.y);
              pathStarted = true;
            }
            ctx.lineTo(centerX + p2.x, centerY + p2.y);
          } else if (p1.z >= 0 && p2.z < 0) {
            const t = p1.z / (p1.z - p2.z);
            const cx = p1.x + t * (p2.x - p1.x);
            const cy = p1.y + t * (p2.y - p1.y);
            if (!pathStarted) {
              ctx.moveTo(centerX + p1.x, centerY + p1.y);
              pathStarted = true;
            }
            ctx.lineTo(centerX + cx, centerY + cy);
            pathStarted = false;
          } else if (p1.z < 0 && p2.z >= 0) {
            const t = -p1.z / (p2.z - p1.z);
            const cx = p1.x + t * (p2.x - p1.x);
            const cy = p1.y + t * (p2.y - p1.y);
            ctx.moveTo(centerX + cx, centerY + cy);
            ctx.lineTo(centerX + p2.x, centerY + p2.y);
            pathStarted = true;
          } else {
            pathStarted = false;
          }
        }
        ctx.stroke();
      }
      ctx.restore();

      // Second pass: Sharp crisp continental coastlines
      ctx.save();
      ctx.strokeStyle = "rgba(45, 212, 191, 0.85)";
      ctx.lineWidth = 1.35;
      for (let r = 0; r < WORLD_COASTLINES.length; r++) {
        const ring = WORLD_COASTLINES[r];
        ctx.beginPath();
        let pathStarted = false;
        for (let i = 0; i < ring.length - 1; i++) {
          const p1 = projectGlobePoint(ring[i][0], ring[i][1], radius, rotX, rotY);
          const p2 = projectGlobePoint(ring[i + 1][0], ring[i + 1][1], radius, rotX, rotY);

          if (p1.z >= 0 && p2.z >= 0) {
            if (!pathStarted) {
              ctx.moveTo(centerX + p1.x, centerY + p1.y);
              pathStarted = true;
            }
            ctx.lineTo(centerX + p2.x, centerY + p2.y);
          } else if (p1.z >= 0 && p2.z < 0) {
            const t = p1.z / (p1.z - p2.z);
            const cx = p1.x + t * (p2.x - p1.x);
            const cy = p1.y + t * (p2.y - p1.y);
            if (!pathStarted) {
              ctx.moveTo(centerX + p1.x, centerY + p1.y);
              pathStarted = true;
            }
            ctx.lineTo(centerX + cx, centerY + cy);
            pathStarted = false;
          } else if (p1.z < 0 && p2.z >= 0) {
            const t = -p1.z / (p2.z - p1.z);
            const cx = p1.x + t * (p2.x - p1.x);
            const cy = p1.y + t * (p2.y - p1.y);
            ctx.moveTo(centerX + cx, centerY + cy);
            ctx.lineTo(centerX + p2.x, centerY + p2.y);
            pathStarted = true;
          } else {
            pathStarted = false;
          }
        }
        ctx.stroke();
      }
      ctx.restore();

      // -------------------------------------------------------------
      // 5. CONTINENTAL CITY LIGHTS / LAND MATRIX PARTICLES
      // -------------------------------------------------------------
      for (let i = 0; i < WORLD_LAND_POINTS.length; i++) {
        const pt = WORLD_LAND_POINTS[i];
        const p = projectGlobePoint(pt[0], pt[1], radius, rotX, rotY);
        if (p.z > 0) {
          const d = p.z / radius; // 0 at horizon, 1 at center
          const alpha = 0.25 + 0.65 * d;
          const size = 1.0 + 0.75 * d;

          // Differentiate high-density economic zones (India, Gulf, Europe, North America)
          const isMajorMetro =
            (pt[0] > 8 && pt[0] < 34 && pt[1] > 68 && pt[1] < 90) || // Indian subcontinent
            (pt[0] > 20 && pt[0] < 32 && pt[1] > 45 && pt[1] < 60) || // Gulf / UAE
            (pt[0] > 36 && pt[0] < 58 && pt[1] > -10 && pt[1] < 25) || // Europe
            (pt[0] > 26 && pt[0] < 45 && pt[1] > -122 && pt[1] < -70); // USA

          if (isMajorMetro && i % 4 === 0) {
            ctx.fillStyle = `rgba(251, 191, 36, ${alpha * 0.95})`; // Amber city lights
          } else if (isMajorMetro && i % 9 === 0) {
            ctx.fillStyle = `rgba(244, 63, 94, ${alpha * 0.85})`; // Ruby transit node
          } else {
            ctx.fillStyle = `rgba(56, 189, 248, ${alpha * 0.72})`; // Electric cyan landmass
          }
          ctx.fillRect(centerX + p.x - size / 2, centerY + p.y - size / 2, size, size);
        }
      }

      // -------------------------------------------------------------
      // 6. RAYLEIGH ATMOSPHERIC FRESNEL LIMB (EDGE BRIGHTENING)
      // -------------------------------------------------------------
      const innerRim = ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.78,
        centerX,
        centerY,
        radius
      );
      innerRim.addColorStop(0, "rgba(45, 212, 191, 0)");
      innerRim.addColorStop(0.72, "rgba(45, 212, 191, 0.12)");
      innerRim.addColorStop(0.92, "rgba(56, 189, 248, 0.35)");
      innerRim.addColorStop(1, "rgba(56, 189, 248, 0.65)");
      ctx.fillStyle = innerRim;
      ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

      ctx.restore(); // remove sphere clip

      // Globe boundary ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(45, 212, 191, 0.45)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();

      // -------------------------------------------------------------
      // 7. ELEVATED 3D GREAT-CIRCLE FLIGHT ARCS & AIRCRAFT PHOTONS
      // -------------------------------------------------------------
      let detectedHover: HubNode | null = null;

      FLIGHT_ROUTES.forEach((route, routeIdx) => {
        const fromHub = GLOBAL_HUBS.find((h) => h.id === route.from);
        const toHub = GLOBAL_HUBS.find((h) => h.id === route.to);
        if (!fromHub || !toHub) return;

        const u1 = latLonToUnitVector(fromHub.lat, fromHub.lon);
        const u2 = latLonToUnitVector(toHub.lat, toHub.lon);

        const dot = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y + u1.z * u2.z));
        const omega = Math.acos(dot);
        if (omega < 0.01) return;

        const sinOmega = Math.sin(omega);
        const steps = 30;
        const arcPoints: { x: number; y: number; z: number }[] = [];

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const w1 = Math.sin((1 - t) * omega) / sinOmega;
          const w2 = Math.sin(t * omega) / sinOmega;
          const ux = w1 * u1.x + w2 * u2.x;
          const uy = w1 * u1.y + w2 * u2.y;
          const uz = w1 * u1.z + w2 * u2.z;

          // Elevation above Earth surface (curved 3D altitude)
          const altitude = 1 + 0.15 * Math.sin(t * Math.PI) * Math.min(1.25, omega);
          const r = radius * altitude;
          arcPoints.push(rotate3DVector(ux * r, uy * r, uz * r, rotX, rotY));
        }

        // Draw elevated flight path (only front-facing segments)
        ctx.save();
        ctx.beginPath();
        let drawing = false;
        for (let i = 0; i < arcPoints.length; i++) {
          const pt = arcPoints[i];
          if (pt.z > -radius * 0.12) {
            if (!drawing) {
              ctx.moveTo(centerX + pt.x, centerY + pt.y);
              drawing = true;
            } else {
              ctx.lineTo(centerX + pt.x, centerY + pt.y);
            }
          } else {
            drawing = false;
          }
        }

        const isConnectedToHover =
          hoveredHub && (hoveredHub.id === route.from || hoveredHub.id === route.to);

        const arcGrad = ctx.createLinearGradient(
          centerX + arcPoints[0].x,
          centerY + arcPoints[0].y,
          centerX + arcPoints[steps].x,
          centerY + arcPoints[steps].y
        );

        if (isConnectedToHover) {
          arcGrad.addColorStop(0, "rgba(251, 191, 36, 0.4)");
          arcGrad.addColorStop(0.5, "rgba(251, 191, 36, 1.0)");
          arcGrad.addColorStop(1, "rgba(45, 212, 191, 0.8)");
          ctx.strokeStyle = arcGrad;
          ctx.lineWidth = 2.4;
        } else {
          arcGrad.addColorStop(0, "rgba(20, 184, 166, 0.25)");
          arcGrad.addColorStop(0.5, "rgba(45, 212, 191, 0.82)");
          arcGrad.addColorStop(1, "rgba(56, 189, 248, 0.35)");
          ctx.strokeStyle = arcGrad;
          ctx.lineWidth = 1.6;
        }
        ctx.stroke();
        ctx.restore();

        // Animated Aircraft Photon with particle comet tail
        const progress = (animationTime * 0.24 + routeIdx * 0.15) % 1;
        const photonIdx = Math.floor(progress * steps);
        const nextIdx = Math.min(steps, photonIdx + 1);
        const subT = progress * steps - photonIdx;
        const pA = arcPoints[photonIdx];
        const pB = arcPoints[nextIdx];

        if (pA && pB) {
          const curX = pA.x + (pB.x - pA.x) * subT;
          const curY = pA.y + (pB.y - pA.y) * subT;
          const curZ = pA.z + (pB.z - pA.z) * subT;

          if (curZ > -radius * 0.08) {
            const scrX = centerX + curX;
            const scrY = centerY + curY;

            ctx.save();
            // Aircraft glowing core
            ctx.beginPath();
            ctx.arc(scrX, scrY, isConnectedToHover ? 4.5 : 3.4, 0, Math.PI * 2);
            ctx.fillStyle = "#FFFFFF";
            ctx.shadowColor = isConnectedToHover ? "#FBBF24" : "#2DD4BF";
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Halo pulse
            ctx.beginPath();
            ctx.arc(scrX, scrY, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = isConnectedToHover
              ? "rgba(251, 191, 36, 0.35)"
              : "rgba(45, 212, 191, 0.3)";
            ctx.fill();

            // Flight code indicator when route is active/hovered
            if (isConnectedToHover) {
              ctx.font = "bold 9.5px 'JetBrains Mono', monospace";
              ctx.fillStyle = "#FBBF24";
              ctx.fillText(`${route.code} · ${route.carrier}`, scrX + 9, scrY - 5);
            }
            ctx.restore();
          }
        }
      });

      // -------------------------------------------------------------
      // 8. GLOBAL AVIATION HUBS (RADAR BEACONS & CALLOUT BADGES)
      // -------------------------------------------------------------
      GLOBAL_HUBS.forEach((hub, idx) => {
        const u = latLonToUnitVector(hub.lat, hub.lon);
        const rot = rotate3DVector(u.x * radius, u.y * radius, u.z * radius, rotX, rotY);
        const visible = rot.z > -radius * 0.12;
        if (!visible) return;

        const px = centerX + rot.x;
        const py = centerY + rot.y;
        const isHovered = hoveredHub?.id === hub.id;
        const isConnected =
          hoveredHub &&
          FLIGHT_ROUTES.some(
            (r) =>
              (r.from === hoveredHub.id && r.to === hub.id) ||
              (r.to === hoveredHub.id && r.from === hub.id)
          );

        // Hover detection
        const mouseDist = Math.hypot(px - mouseCanvasX, py - mouseCanvasY);
        if (mouseDist < 22) {
          detectedHover = hub;
        }

        ctx.save();

        // Pulsing radar sonar ripples
        const pulseProgress = (animationTime * 1.8 + idx * 0.3) % 1;
        const pulseRadius = 5 + pulseProgress * 18;
        const pulseAlpha = Math.max(0, (1 - pulseProgress) * (isHovered ? 0.75 : 0.35));

        ctx.beginPath();
        ctx.arc(px, py, pulseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = isHovered
          ? `rgba(251, 191, 36, ${pulseAlpha})`
          : `rgba(45, 212, 191, ${pulseAlpha})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Solid beacon point
        ctx.beginPath();
        ctx.arc(px, py, isHovered ? 5.5 : 3.8, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? "#FBBF24" : isConnected ? "#38BDF8" : "#FFFFFF";
        ctx.shadowColor = isHovered ? "#FBBF24" : "#2DD4BF";
        ctx.shadowBlur = 9;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Callout Badge Pill
        const labelText = hub.code;
        ctx.font = isHovered
          ? "bold 11px 'JetBrains Mono', monospace"
          : "600 10px 'JetBrains Mono', monospace";
        const textWidth = ctx.measureText(labelText).width;
        const pillW = textWidth + 10;
        const pillH = 16;
        const pillX = px + 8;
        const pillY = py - 8;

        // Background pill
        ctx.fillStyle = isHovered ? "rgba(15, 23, 42, 0.95)" : "rgba(10, 15, 29, 0.85)";
        ctx.strokeStyle = isHovered ? "#FBBF24" : "rgba(45, 212, 191, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") {
          (ctx as any).roundRect(pillX, pillY - 11, pillW, pillH, 4);
        } else {
          ctx.rect(pillX, pillY - 11, pillW, pillH);
        }
        ctx.fill();
        ctx.stroke();

        // Code text
        ctx.fillStyle = isHovered ? "#FBBF24" : "#E2E8F0";
        ctx.fillText(labelText, pillX + 5, pillY);

        if (isHovered) {
          ctx.font = "bold 9.5px 'Inter', sans-serif";
          ctx.fillStyle = "#38BDF8";
          ctx.fillText(
            `${hub.city}, ${hub.country} · ${hub.activeRoutes} routes`,
            pillX,
            pillY + 18
          );
        }

        ctx.restore();
      });

      // Update hover state and telemetry
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
      canvas.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [hoveredHub]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[460px] sm:h-[540px] lg:h-[620px] select-none cursor-grab active:cursor-grabbing bg-[#050B14]"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Futuristic Telemetry HUD Overlay */}
      <div className="absolute top-4 left-4 p-3 rounded-xl bg-slate-950/85 border border-slate-800/90 backdrop-blur-md text-[11px] font-mono space-y-1 shadow-2xl pointer-events-none">
        <div className="flex items-center gap-2 text-teal-400 font-bold">
          <Radio size={12} className="animate-pulse" />
          <span>3D EARTH CORRIDOR RADAR · LIVE</span>
        </div>
        <div className="text-slate-400 flex items-center justify-between gap-4">
          <span>COORDS</span>
          <span className="text-white font-semibold">{telemetry.coords}</span>
        </div>
        <div className="text-slate-400 flex items-center justify-between gap-4">
          <span>AIR HUBS</span>
          <span className="text-teal-300 font-semibold">{telemetry.hubCount} Gateways Active</span>
        </div>
        <div className="text-slate-400 flex items-center justify-between gap-4">
          <span>ROUTES</span>
          <span className="text-cyan-300 font-semibold">{telemetry.activeRoutes} Great-Circle Arcs</span>
        </div>
      </div>

      {/* Security & SLA Badges Bottom Right */}
      <div className="absolute bottom-4 right-4 p-3 rounded-xl bg-slate-950/85 border border-slate-800/90 backdrop-blur-md text-[10.5px] space-y-1 text-right shadow-2xl pointer-events-none">
        <div className="flex items-center justify-end gap-1.5 text-emerald-400 font-bold">
          <ShieldCheck size={13} />
          <span>TLS 1.3 · TENANT ISOLATION</span>
        </div>
        <p className="text-slate-400 font-mono text-[10px]">
          Fulfillment SLA: <strong className="text-white">&lt; 4h Ticketing</strong>
        </p>
      </div>

      {/* Interactive prompt hint */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-[10.5px] text-slate-400 backdrop-blur-md flex items-center gap-2 pointer-events-none shadow-lg">
        <Compass size={12} className="text-teal-400 animate-spin" style={{ animationDuration: "12s" }} />
        <span>Click & drag to rotate 3D Earth</span>
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
