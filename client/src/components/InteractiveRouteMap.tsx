import { useState } from "react";
import { Plane, MapPin, Globe2, Clock } from "lucide-react";

interface CityHub {
  id: string;
  name: string;
  country: string;
  code: string;
  x: number; // SVG coordinate 0-1000
  y: number; // SVG coordinate 0-500
  labelX: number;
  labelY: number;
  textAnchor: "start" | "middle" | "end";
  tripsCount: number;
  timezone: string;
  avgDuration: string;
  isHq?: boolean;
}

const HUBS: CityHub[] = [
  {
    id: "blr",
    name: "Bengaluru",
    country: "India",
    code: "BLR",
    x: 712,
    y: 264,
    labelX: 726,
    labelY: 268,
    textAnchor: "start",
    tripsCount: 14,
    timezone: "GMT+5:30",
    avgDuration: "Global HQ Hub",
    isHq: true,
  },
  {
    id: "bom",
    name: "Mumbai",
    country: "India",
    code: "BOM",
    x: 692,
    y: 242,
    labelX: 680,
    labelY: 242,
    textAnchor: "end",
    tripsCount: 6,
    timezone: "GMT+5:30",
    avgDuration: "1h 45m from HQ",
  },
  {
    id: "del",
    name: "New Delhi",
    country: "India",
    code: "DEL",
    x: 708,
    y: 210,
    labelX: 708,
    labelY: 194,
    textAnchor: "middle",
    tripsCount: 8,
    timezone: "GMT+5:30",
    avgDuration: "2h 45m from HQ",
  },
  {
    id: "dxb",
    name: "Dubai",
    country: "UAE",
    code: "DXB",
    x: 642,
    y: 228,
    labelX: 630,
    labelY: 228,
    textAnchor: "end",
    tripsCount: 5,
    timezone: "GMT+4",
    avgDuration: "3h 50m from HQ",
  },
  {
    id: "lhr",
    name: "London",
    country: "UK",
    code: "LHR",
    x: 485,
    y: 132,
    labelX: 472,
    labelY: 130,
    textAnchor: "end",
    tripsCount: 4,
    timezone: "GMT+1",
    avgDuration: "9h 30m from HQ",
  },
  {
    id: "fra",
    name: "Frankfurt",
    country: "Germany",
    code: "FRA",
    x: 522,
    y: 136,
    labelX: 535,
    labelY: 136,
    textAnchor: "start",
    tripsCount: 3,
    timezone: "GMT+2",
    avgDuration: "8h 45m from HQ",
  },
  {
    id: "sin",
    name: "Singapore",
    country: "Singapore",
    code: "SIN",
    x: 778,
    y: 298,
    labelX: 790,
    labelY: 302,
    textAnchor: "start",
    tripsCount: 9,
    timezone: "GMT+8",
    avgDuration: "4h 15m from HQ",
  },
  {
    id: "tyo",
    name: "Tokyo",
    country: "Japan",
    code: "TYO",
    x: 882,
    y: 185,
    labelX: 894,
    labelY: 185,
    textAnchor: "start",
    tripsCount: 2,
    timezone: "GMT+9",
    avgDuration: "7h 30m from HQ",
  },
  {
    id: "sfo",
    name: "San Francisco",
    country: "USA",
    code: "SFO",
    x: 168,
    y: 182,
    labelX: 156,
    labelY: 182,
    textAnchor: "end",
    tripsCount: 3,
    timezone: "GMT-7",
    avgDuration: "19h (1-stop)",
  },
  {
    id: "jfk",
    name: "New York",
    country: "USA",
    code: "JFK",
    x: 285,
    y: 172,
    labelX: 297,
    labelY: 172,
    textAnchor: "start",
    tripsCount: 4,
    timezone: "GMT-4",
    avgDuration: "15h 20m from HQ",
  },
];

const FLIGHT_ROUTES = [
  { from: "blr", to: "del", frequency: "Daily 4x" },
  { from: "blr", to: "bom", frequency: "Daily 5x" },
  { from: "blr", to: "sin", frequency: "Daily 2x" },
  { from: "blr", to: "dxb", frequency: "Daily 2x" },
  { from: "blr", to: "lhr", frequency: "Daily 1x" },
  { from: "del", to: "sfo", frequency: "3x Weekly" },
  { from: "bom", to: "lhr", frequency: "Daily 1x" },
  { from: "lhr", to: "jfk", frequency: "Daily 3x" },
  { from: "sin", to: "tyo", frequency: "Daily 2x" },
  { from: "dxb", to: "fra", frequency: "Daily 2x" },
];

export function InteractiveRouteMap() {
  const [selectedHub, setSelectedHub] = useState<CityHub>(HUBS[0]);
  const [hoveredHub, setHoveredHub] = useState<CityHub | null>(null);
  const [filterRegion, setFilterRegion] = useState<"ALL" | "APAC" | "EMEA" | "AMER">("ALL");

  const getHub = (id: string) => HUBS.find((h) => h.id === id);

  const activeHubId = hoveredHub?.id || selectedHub.id;

  // Filter routes if region selected
  const visibleRoutes = FLIGHT_ROUTES.filter((r) => {
    if (filterRegion === "ALL") return true;
    const from = getHub(r.from);
    const to = getHub(r.to);
    if (!from || !to) return false;
    if (filterRegion === "APAC") {
      return ["blr", "del", "bom", "sin", "tyo"].includes(r.from) || ["blr", "del", "bom", "sin", "tyo"].includes(r.to);
    }
    if (filterRegion === "EMEA") {
      return ["lhr", "fra", "dxb"].includes(r.from) || ["lhr", "fra", "dxb"].includes(r.to);
    }
    if (filterRegion === "AMER") {
      return ["sfo", "jfk"].includes(r.from) || ["sfo", "jfk"].includes(r.to);
    }
    return true;
  });

  return (
    <div className="panel p-6 space-y-5 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E7EC] dark:border-[#1E293B] shadow-sm">
      {/* Header with Title and Region Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <span className="card-kicker">GLOBAL CORPORATE TRAVEL NETWORK</span>
          <h2 className="section-heading flex items-center gap-2">
            <Globe2 size={20} className="text-[#F2A93B]" /> Interactive Flight Corridors
          </h2>
          <p className="text-xs text-[#667085] dark:text-[#94A3B8] mt-0.5">
            Real-time corporate flight corridors across global hubs. Click or hover any hub for corridor analysis.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center bg-[#F1F5F9] dark:bg-[#1E293B] p-1 rounded-xl border border-[#E2E8F0] dark:border-[#334155] text-xs">
            {(["ALL", "APAC", "EMEA", "AMER"] as const).map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => setFilterRegion(region)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  filterRegion === region
                    ? "bg-[#F2A93B] text-white shadow-sm"
                    : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white"
                }`}
              >
                {region === "ALL" ? "All Corridors" : region}
              </button>
            ))}
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F2A93B]/10 text-[#E8961C] dark:text-[#F6BC55] font-semibold border border-[#F2A93B]/20 text-xs">
            <span className="w-2 h-2 rounded-full bg-[#F2A93B] animate-pulse" />
            10 Active Hubs
          </span>
        </div>
      </div>

      {/* SVG Map Container */}
      <div className="relative w-full rounded-2xl bg-gradient-to-b from-[#0B1329] via-[#0F172A] to-[#0A0F1D] p-3 sm:p-5 overflow-hidden border border-slate-800 shadow-2xl">
        {/* Subtle grid pattern background */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(#38BDF8 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <svg
          viewBox="0 0 1000 480"
          className="w-full h-auto max-h-[420px] select-none"
          style={{ overflow: "visible" }}
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="corridorGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F6BC55" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#F2A93B" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.9" />
            </linearGradient>

            <linearGradient id="inactiveCorridor" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#1E293B" stopOpacity="0.2" />
            </linearGradient>

            <filter id="hubGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            <filter id="hqPulseGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Graticule Latitude & Longitude lines */}
          <g stroke="#334155" strokeWidth="0.5" strokeDasharray="3 4" opacity="0.3">
            {/* Longitude */}
            <line x1="167" y1="20" x2="167" y2="460" />
            <line x1="333" y1="20" x2="333" y2="460" />
            <line x1="500" y1="20" x2="500" y2="460" />
            <line x1="667" y1="20" x2="667" y2="460" />
            <line x1="833" y1="20" x2="833" y2="460" />
            {/* Latitude */}
            <line x1="40" y1="100" x2="960" y2="100" />
            <line x1="40" y1="170" x2="960" y2="170" />
            <line x1="40" y1="240" x2="960" y2="240" stroke="#0EA5E9" strokeWidth="0.7" opacity="0.5" /> {/* Equator */}
            <line x1="40" y1="310" x2="960" y2="310" />
            <line x1="40" y1="380" x2="960" y2="380" />
          </g>

          {/* Accurate, Detailed World Continents & Major Islands */}
          <g
            fill="#1E293B"
            stroke="#334155"
            strokeWidth="0.8"
            strokeLinejoin="round"
            className="transition-colors duration-500"
            opacity="0.85"
          >
            {/* NORTH AMERICA (Alaska, Canada, USA, Mexico, Central America) */}
            <path d="M 68 82 L 95 68 L 138 60 L 175 64 L 210 52 L 238 62 L 265 55 L 292 72 L 285 95 L 305 110 L 322 135 L 298 152 L 282 150 L 268 165 L 285 190 L 280 220 L 264 218 L 248 238 L 235 258 L 222 245 L 208 228 L 195 210 L 178 208 L 165 198 L 148 190 L 138 168 L 118 145 L 98 135 L 82 120 L 68 82 Z" />
            {/* Alaska Peninsula & Aleutian Arc */}
            <path d="M 62 88 L 78 80 L 88 95 L 75 105 L 54 110 Z" />
            {/* Florida Peninsula */}
            <path d="M 268 214 L 275 238 L 265 240 L 260 220 Z" />
            {/* Baja California */}
            <path d="M 166 200 L 178 236 L 171 238 L 160 205 Z" />
            {/* Greenland */}
            <path d="M 325 45 L 372 40 L 388 75 L 360 102 L 332 90 L 320 65 Z" />
            {/* Caribbean Islands */}
            <path d="M 262 250 L 282 246 L 278 252 Z M 284 252 L 298 256 L 294 260 Z" />

            {/* SOUTH AMERICA (Colombia, Venezuela, Brazil, Argentina, Chile) */}
            <path d="M 235 258 L 268 252 L 308 265 L 342 295 L 338 335 L 318 375 L 302 410 L 284 445 L 274 448 L 265 425 L 268 375 L 255 330 L 238 290 L 235 258 Z" />
            {/* Tierra del Fuego / Falklands */}
            <path d="M 272 452 L 285 450 L 280 460 L 270 458 Z M 300 442 L 310 440 L 306 448 Z" />

            {/* EUROPE (UK, Scandinavia, Western Europe, Mediterranean, Eastern Europe) */}
            <path d="M 458 92 L 485 78 L 515 82 L 540 105 L 565 110 L 568 148 L 535 158 L 510 168 L 478 165 L 452 145 L 454 118 Z" />
            {/* Scandinavian Peninsula (Norway, Sweden) */}
            <path d="M 495 58 L 528 54 L 542 98 L 518 105 L 500 88 Z" />
            {/* Great Britain & Ireland */}
            <path d="M 466 114 L 482 108 L 488 138 L 472 145 Z" />
            <path d="M 448 122 L 458 120 L 456 136 L 446 134 Z" />
            {/* Iberian Peninsula (Spain, Portugal) */}
            <path d="M 442 165 L 472 162 L 468 196 L 438 194 Z" />
            {/* Italian Peninsula */}
            <path d="M 502 164 L 518 170 L 526 198 L 516 202 Z" />
            {/* Greece & Balkans */}
            <path d="M 532 172 L 552 170 L 548 195 L 536 192 Z" />

            {/* AFRICA (North Africa, Sahara, West Africa, Central Africa, Southern Africa) */}
            <path d="M 442 196 L 518 194 L 565 218 L 588 250 L 555 285 L 538 340 L 520 388 L 490 395 L 472 345 L 438 285 L 428 235 L 442 196 Z" />
            {/* Madagascar */}
            <path d="M 568 335 L 582 330 L 576 380 L 562 370 Z" />

            {/* ASIA & MIDDLE EAST */}
            {/* Mainland Asia (Russia, Central Asia, China, Siberia, Indochina) */}
            <path d="M 568 110 L 620 90 L 700 85 L 780 80 L 850 88 L 888 112 L 852 145 L 882 170 L 855 205 L 825 220 L 802 265 L 778 298 L 755 265 L 730 235 L 712 280 L 688 255 L 678 222 L 632 212 L 598 238 L 578 218 L 568 148 Z" />
            {/* Arabian Peninsula */}
            <path d="M 608 216 L 652 225 L 664 265 L 625 272 L 602 242 Z" />
            {/* Indian Subcontinent (Clearly defined peninsular shape) */}
            <path d="M 678 222 L 728 226 L 724 278 L 708 292 L 685 260 Z" />
            {/* Sri Lanka */}
            <path d="M 716 298 L 725 298 L 722 312 L 715 310 Z" />
            {/* Korean Peninsula */}
            <path d="M 838 178 L 850 178 L 848 198 L 838 196 Z" />
            {/* Japan (Honshu, Hokkaido, Kyushu) */}
            <path d="M 870 172 L 888 180 L 882 208 L 866 198 Z M 882 150 L 898 160 L 888 170 Z" />
            {/* Southeast Asian Archipelago (Sumatra, Java, Borneo, Philippines) */}
            <path d="M 752 312 L 788 325 L 775 338 Z" />
            <path d="M 788 305 L 825 315 L 812 332 Z" />
            <path d="M 822 250 L 836 265 L 828 292 Z" />
            <path d="M 845 312 L 885 318 L 865 338 Z" />

            {/* AUSTRALIA & OCEANIA */}
            <path d="M 776 348 L 832 334 L 872 344 L 888 382 L 868 432 L 814 438 L 772 402 L 766 368 Z" />
            {/* Tasmania */}
            <path d="M 848 448 L 862 448 L 858 462 L 846 460 Z" />
            {/* New Zealand */}
            <path d="M 915 418 L 930 414 L 922 448 Z M 906 448 L 920 444 L 912 468 Z" />
          </g>

          {/* Corporate Air Corridors (Curved Arcs) */}
          {visibleRoutes.map((route, i) => {
            const from = getHub(route.from);
            const to = getHub(route.to);
            if (!from || !to) return null;

            // Quadratic bezier calculation
            const midX = (from.x + to.x) / 2;
            const dist = Math.abs(from.x - to.x);
            // Dynamic altitude arch
            const archHeight = Math.min(dist * 0.24, 75);
            const midY = Math.min(from.y, to.y) - archHeight;

            const isRelatedToActive =
              activeHubId === from.id || activeHubId === to.id;

            return (
              <g key={`corridor-${route.from}-${route.to}-${i}`}>
                {/* Glow underlay for active routes */}
                {isRelatedToActive && (
                  <path
                    d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
                    fill="none"
                    stroke="#F2A93B"
                    strokeWidth="5"
                    opacity="0.3"
                    strokeLinecap="round"
                    filter="url(#hubGlow)"
                  />
                )}

                {/* Primary flight corridor stroke */}
                <path
                  d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={isRelatedToActive ? "url(#corridorGlow)" : "#334155"}
                  strokeWidth={isRelatedToActive ? 2.5 : 1.2}
                  strokeDasharray={isRelatedToActive ? "6 4" : "3 3"}
                  opacity={isRelatedToActive ? 1 : 0.4}
                  className="transition-all duration-300"
                />

                {/* Animated traveling dot along the active route */}
                {isRelatedToActive && (
                  <circle r="3" fill="#38BDF8">
                    <animateMotion
                      path={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
                      dur="3.2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </g>
            );
          })}

          {/* City Hub Markers & Non-Overlapping Label Badges */}
          {HUBS.map((hub) => {
            const isSelected = selectedHub.id === hub.id;
            const isHovered = hoveredHub?.id === hub.id;
            const isActive = isSelected || isHovered;

            // Width of text pill background based on label length
            const textWidth = hub.isHq
              ? hub.name.length * 6.8 + 36
              : hub.name.length * 6.5 + 16;
            const pillX =
              hub.textAnchor === "start"
                ? hub.labelX - 4
                : hub.textAnchor === "end"
                ? hub.labelX - textWidth + 4
                : hub.labelX - textWidth / 2;

            return (
              <g
                key={hub.id}
                className="cursor-pointer group"
                onClick={() => setSelectedHub(hub)}
                onMouseEnter={() => setHoveredHub(hub)}
                onMouseLeave={() => setHoveredHub(null)}
              >
                {/* Radar pulse halo for HQ or selected hub */}
                {(hub.isHq || isActive) && (
                  <circle
                    cx={hub.x}
                    cy={hub.y}
                    r={isActive ? 14 : 10}
                    fill="none"
                    stroke={hub.isHq ? "#F6BC55" : "#F2A93B"}
                    strokeWidth={hub.isHq ? 1.8 : 1.2}
                    className="animate-ping opacity-75 origin-center"
                    style={{ transformOrigin: `${hub.x}px ${hub.y}px` }}
                  />
                )}

                {/* Hub Outer Ring */}
                <circle
                  cx={hub.x}
                  cy={hub.y}
                  r={isActive ? 7 : hub.isHq ? 6 : 4.5}
                  fill={hub.isHq ? "#E8961C" : isActive ? "#F2A93B" : "#1E293B"}
                  stroke={hub.isHq ? "#F6BC55" : isActive ? "#FFFFFF" : "#0EA5E9"}
                  strokeWidth={isActive ? 2 : 1.2}
                  filter={isActive ? "url(#hubGlow)" : undefined}
                  className="transition-all duration-200"
                />

                {/* Center Core Dot */}
                <circle
                  cx={hub.x}
                  cy={hub.y}
                  r={isActive ? 3 : 2}
                  fill="#FFFFFF"
                />

                {/* Non-overlapping Label Badge Pill Background */}
                <rect
                  x={pillX}
                  y={hub.labelY - 11}
                  width={textWidth}
                  height={16}
                  rx="4"
                  fill={
                    isActive
                      ? "rgba(15, 23, 42, 0.95)"
                      : hub.isHq
                      ? "rgba(217, 118, 26, 0.35)"
                      : "rgba(15, 23, 42, 0.82)"
                  }
                  stroke={
                    isActive
                      ? "#F2A93B"
                      : hub.isHq
                      ? "#F6BC55"
                      : "rgba(255, 255, 255, 0.15)"
                  }
                  strokeWidth={isActive ? "1" : "0.5"}
                  className="transition-all duration-200"
                />

                {/* Text Label */}
                <text
                  x={hub.labelX}
                  y={hub.labelY}
                  textAnchor={hub.textAnchor}
                  fill={
                    isActive
                      ? "#F6BC55"
                      : hub.isHq
                      ? "#F9C48D"
                      : "#E2E8F0"
                  }
                  fontSize={hub.isHq || isActive ? "10" : "8.5"}
                  fontWeight={hub.isHq || isActive ? "700" : "500"}
                  letterSpacing="0.02em"
                  className="pointer-events-none select-none transition-colors duration-200"
                >
                  {hub.isHq ? `${hub.name} (HQ)` : hub.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected Hub Interactive Control Overlay */}
        <div className="mt-4 p-4 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-white transition-all">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white shadow-md ${
                selectedHub.isHq
                  ? "bg-gradient-to-br from-[#F2A93B] to-[#E8961C] ring-2 ring-[#F6BC55]/40"
                  : "bg-gradient-to-br from-[#0284C7] to-[#0369A1]"
              }`}
            >
              <MapPin size={22} />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="text-base font-bold text-white tracking-tight">
                  {selectedHub.name}, {selectedHub.country}
                </strong>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300 font-bold">
                  {selectedHub.code}
                </span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#F2A93B]/20 text-[#F6BC55] border border-[#F2A93B]/30 font-semibold">
                  {selectedHub.tripsCount} journeys
                </span>
                {selectedHub.isHq && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8961C] text-white font-bold">
                    Primary Corporate Hub
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-300 mt-1 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Clock size={13} className="text-[#F6BC55]" /> Timezone: {selectedHub.timezone}
                </span>
                <span className="text-slate-600">·</span>
                <span className="flex items-center gap-1.5">
                  <Plane size={13} className="text-[#38BDF8]" /> {selectedHub.avgDuration}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-700/50">
            <div className="text-right hidden sm:block">
              <span className="text-[11px] text-slate-400 block">Flight status</span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active Corridors
              </span>
            </div>

            <span className="text-xs text-slate-300 bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-lg border border-white/10 font-medium transition-colors">
              Corporate Travel Approved
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
