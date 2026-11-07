import { useEffect, useRef, useState } from "react";
import { Compass, Radio, ShieldCheck } from "lucide-react";
import { WORLD_COASTLINES, WORLD_LAND_POINTS } from "@/components/worldData";

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

export function CorridorGlobe() {
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
      outerCorona.addColorStop(0, "rgba(246, 168, 90, 0.28)");
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
        ctx.strokeStyle = isEquator ? "rgba(246, 168, 90, 0.35)" : "rgba(56, 189, 248, 0.12)";
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
      ctx.strokeStyle = "rgba(242, 140, 40, 0.18)";
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
      ctx.strokeStyle = "rgba(246, 168, 90, 0.85)";
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
      innerRim.addColorStop(0, "rgba(246, 168, 90, 0)");
      innerRim.addColorStop(0.72, "rgba(246, 168, 90, 0.12)");
      innerRim.addColorStop(0.92, "rgba(56, 189, 248, 0.35)");
      innerRim.addColorStop(1, "rgba(56, 189, 248, 0.65)");
      ctx.fillStyle = innerRim;
      ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

      ctx.restore(); // remove sphere clip

      // Globe boundary ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(246, 168, 90, 0.45)";
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
          arcGrad.addColorStop(1, "rgba(246, 168, 90, 0.8)");
          ctx.strokeStyle = arcGrad;
          ctx.lineWidth = 2.4;
        } else {
          arcGrad.addColorStop(0, "rgba(242, 140, 40, 0.25)");
          arcGrad.addColorStop(0.5, "rgba(246, 168, 90, 0.82)");
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
            ctx.shadowColor = isConnectedToHover ? "#FBBF24" : "#F6A85A";
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Halo pulse
            ctx.beginPath();
            ctx.arc(scrX, scrY, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = isConnectedToHover
              ? "rgba(251, 191, 36, 0.35)"
              : "rgba(246, 168, 90, 0.3)";
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
          : `rgba(246, 168, 90, ${pulseAlpha})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Solid beacon point
        ctx.beginPath();
        ctx.arc(px, py, isHovered ? 5.5 : 3.8, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? "#FBBF24" : isConnected ? "#38BDF8" : "#FFFFFF";
        ctx.shadowColor = isHovered ? "#FBBF24" : "#F6A85A";
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
        ctx.strokeStyle = isHovered ? "#FBBF24" : "rgba(246, 168, 90, 0.4)";
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
      className="relative w-full h-[460px] sm:h-[540px] lg:h-[620px] select-none cursor-grab active:cursor-grabbing bg-transparent"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Futuristic Telemetry HUD Overlay */}
      <div className="absolute top-4 left-4 p-3 rounded-none bg-[#0A1726]/85 border border-white/10 backdrop-blur-md text-[11px] font-mono space-y-1 shadow-2xl pointer-events-none">
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
      <div className="absolute bottom-4 right-4 p-3 rounded-none bg-[#0A1726]/85 border border-white/10 backdrop-blur-md text-[10.5px] space-y-1 text-right shadow-2xl pointer-events-none">
        <div className="flex items-center justify-end gap-1.5 text-emerald-400 font-bold">
          <ShieldCheck size={13} />
          <span>TLS 1.3 · TENANT ISOLATION</span>
        </div>
        <p className="text-slate-400 font-mono text-[10px]">
          Fulfillment SLA: <strong className="text-white">&lt; 4h Ticketing</strong>
        </p>
      </div>

      {/* Interactive prompt hint */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-none bg-[#0A1726]/80 border border-slate-800 text-[10.5px] text-slate-400 backdrop-blur-md flex items-center gap-2 pointer-events-none shadow-lg">
        <Compass size={12} className="text-teal-400 animate-spin" style={{ animationDuration: "12s" }} />
        <span>Click & drag to rotate 3D Earth</span>
      </div>
    </div>
  );
}
