import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type { TravelPlace, TravelReport } from "../../lib/data/bi";

type CountryFeature = { type: "Feature"; id?: string | number; properties: { name: string }; geometry: unknown };
type Countries = { type: "FeatureCollection"; features: CountryFeature[] };
let worldPromise: Promise<Countries> | null = null;
/** Natural Earth country outlines (public domain), loaded only when a map is shown. */
function loadWorld(): Promise<Countries> {
  if (!worldPromise) {
    worldPromise = import("world-atlas/countries-50m.json").then((m) => {
      const topo = (m as { default?: unknown }).default ?? m;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return feature(topo as any, (topo as any).objects.countries) as unknown as Countries;
    });
  }
  return worldPromise;
}

// ISO numeric codes used by Natural Earth for the home country outline
const ISO_NUMERIC: Record<string, string> = { IN: "356" };
const W = 960;
const H = 560;

/**
 * Where people travelled. Every dot sits on the real coordinates of an
 * airport, station or town from the places list; places that could not be
 * matched are not drawn (the page lists them instead).
 */
export default function TravelMap({ data, view, selected, onSelect }: {
  data: TravelReport;
  view: "all" | "home";
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const [world, setWorld] = useState<Countries | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { loadWorld().then(setWorld).catch(() => setFailed(true)); }, []);

  const byKey = useMemo(() => new Map(data.places.map((p) => [p.key, p])), [data]);
  const shown = useMemo(() => (view === "home" ? data.places.filter((p) => p.country === data.home_country) : data.places), [data, view]);

  const projection = useMemo(() => {
    const pts: GeoPermissibleObjects = {
      type: "MultiPoint",
      coordinates: shown.length ? shown.map((p) => [Number(p.lng), Number(p.lat)]) : [[68, 8], [97, 35]],
    } as GeoPermissibleObjects;
    const home = view === "home" && world ? world.features.find((f) => String((f as { id?: string | number }).id) === ISO_NUMERIC[data.home_country]) : null;
    return geoMercator().fitExtent([[40, 30], [W - 40, H - 30]], (home ?? pts) as GeoPermissibleObjects);
  }, [shown, view, world, data.home_country]);
  const path = useMemo(() => geoPath(projection), [projection]);

  const maxPlace = Math.max(1, ...shown.map((p) => p.visits + p.departures + p.connections));
  const maxLeg = Math.max(1, ...data.legs.map((l) => l.bookings));
  const radius = (p: TravelPlace) => 3 + 13 * Math.sqrt((p.visits + p.departures + p.connections) / maxPlace);
  const shownKeys = new Set(shown.map((p) => p.key));
  const legs = data.legs.filter((l) => shownKeys.has(l.from_key) && shownKeys.has(l.to_key));
  const labelled = new Set([...shown].sort((a, b) => b.visits + b.departures - (a.visits + a.departures)).slice(0, 10).map((p) => p.key));
  const sel = selected ? byKey.get(selected) : null;

  return (
    <div className="bi-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${shown.length} places travelled to or from. The table below lists the same places.`}>
        <rect width={W} height={H} className="bi-map-sea" onClick={() => onSelect(null)} />
        {world && world.features.map((f, i) => (
          <path key={i} d={path(f as GeoPermissibleObjects) ?? undefined}
            className={String((f as { id?: string | number }).id) === ISO_NUMERIC[data.home_country] ? "bi-map-home" : "bi-map-land"} />
        ))}
        {!world && !failed && <text x={W / 2} y={H / 2} textAnchor="middle" className="bi-map-label">Loading map…</text>}
        {legs.map((l) => {
          const a = byKey.get(l.from_key)!;
          const b = byKey.get(l.to_key)!;
          const d = path({ type: "LineString", coordinates: [[Number(a.lng), Number(a.lat)], [Number(b.lng), Number(b.lat)]] } as GeoPermissibleObjects);
          const on = !selected || selected === l.from_key || selected === l.to_key;
          return d ? (
            <path key={`${l.from_key}>${l.to_key}`} d={d} className="bi-map-leg" style={{ strokeWidth: 0.8 + 4 * (l.bookings / maxLeg), opacity: on ? 0.75 : 0.12 }}>
              <title>{`${a.name} → ${b.name}: ${l.bookings} booking${l.bookings === 1 ? "" : "s"}`}</title>
            </path>
          ) : null;
        })}
        {shown.map((p) => {
          const xy = projection([Number(p.lng), Number(p.lat)]);
          if (!xy) return null;
          const on = !selected || selected === p.key;
          return (
            <g key={p.key} transform={`translate(${xy[0]},${xy[1]})`} className="bi-map-place" onClick={(e) => { e.stopPropagation(); onSelect(selected === p.key ? null : p.key); }}
              style={{ opacity: on ? 1 : 0.35 }} tabIndex={0} role="button" aria-label={`${p.name}: ${p.visits} arrivals, ${p.departures} departures`}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected === p.key ? null : p.key); } }}>
              <circle r={radius(p)} className={p.visits > 0 ? "bi-map-dot" : "bi-map-dot bi-map-dot-origin"} />
              <title>{`${p.name}: ${p.visits} arrival${p.visits === 1 ? "" : "s"}, ${p.departures} departure${p.departures === 1 ? "" : "s"}${p.connections ? `, ${p.connections} connection${p.connections === 1 ? "" : "s"}` : ""}`}</title>
              {(labelled.has(p.key) || selected === p.key) && <text x={radius(p) + 4} y={4} className="bi-map-label">{p.name}</text>}
            </g>
          );
        })}
      </svg>
      {failed && <p className="text-xs opacity-70 p-2">The map outline could not load. The places are listed below.</p>}
      {sel && (
        <div className="bi-map-card" role="status">
          <strong>{sel.name}</strong>
          <span>{sel.visits} arrivals · {sel.departures} departures{sel.connections ? ` · ${sel.connections} connections` : ""} · {sel.travellers} travellers</span>
        </div>
      )}
      <p className="bi-map-credit">Country outlines: Natural Earth. Places: OurAirports, datameet/railways, GeoNames.</p>
    </div>
  );
}
