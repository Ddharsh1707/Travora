import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, MapPinOff, Search, X } from "lucide-react";
import { countryName, getTravel, linkPlace, searchLocations, useBiFilters, type LocationHit, type TravelReport } from "../../lib/data/bi";
import BiFilterBar from "./BiFilterBar";
import { Kpi, Panel, ShareBar, count, plural } from "./BiParts";
import TravelMap from "./TravelMap";
import { Empty, ErrorNotice, Loading, PageHeader, formatMoney, labelFor } from "./common";

/** Travel Intelligence: where people go, by which routes, on a map of real places. */
export default function BiTravel({ canLink }: { canLink: boolean }) {
  const [filters, setFilters] = useBiFilters();
  const [data, setData] = useState<TravelReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"all" | "home">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getTravel(filters)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Travel Intelligence."))
      .finally(() => setLoading(false));
  }, [filters]);
  useEffect(() => load(), [load]);

  const cur = data?.base_currency ?? "INR";
  const places = useMemo(() => [...(data?.places ?? [])].sort((a, b) => b.visits - a.visits || b.departures - a.departures), [data]);
  const k = data?.kpis;

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="BUSINESS INTELLIGENCE"
        title="Travel Intelligence"
        description="Where people travelled and how. Places are drawn on their real coordinates; a place in the sheets that can't be matched is listed, never guessed."
      />
      <BiFilterBar filters={filters} onChange={(f) => { setSelected(null); setFilters(f); }} />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading && !data && <Loading label="Placing trips on the map…" />}

      {data && k && (k.bookings === 0 ? <Empty title="No bookings match" description="Upload a travel sheet, or clear some filters." /> : (
        <div className={`page-stack ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Places visited" value={count(k.places)} detail={`${plural(k.countries, "country", "countries")} · ${plural(k.routes, "route")} flown or driven`} />
            <Kpi label="International bookings" value={count(k.international)} detail={`${count(k.domestic)} within ${countryName(data.home_country)}`} />
            <Kpi label="Bookings on the map" value={`${count(k.on_map)} of ${count(k.bookings)}`} detail={k.not_on_map ? `${plural(k.not_on_map, "booking")} with a place that isn't matched` : "Every place matched"} tone={k.not_on_map ? "warn" : undefined} />
            <Kpi label="Busiest destination" value={places[0]?.name ?? "—"} detail={places[0] ? `${plural(places[0].visits, "arrival")} · ${plural(places[0].travellers, "traveller")}` : undefined} />
          </div>

          <Panel title="Travel map" note="Dot size = bookings arriving, leaving or connecting there. Line width = bookings on that leg. Select a place to highlight its routes."
            actions={(
              <div className="bi-seg" role="group" aria-label="Map area">
                <button type="button" className={view === "all" ? "on" : ""} onClick={() => setView("all")} aria-pressed={view === "all"}>All travel</button>
                <button type="button" className={view === "home" ? "on" : ""} onClick={() => setView("home")} aria-pressed={view === "home"}>{countryName(data.home_country)}</button>
              </div>
            )}>
            <TravelMap data={data} view={view} selected={selected} onSelect={setSelected} />
          </Panel>

          {data.not_on_map.length > 0 && (
            <Panel title="Places not on the map" note={canLink
              ? "These spellings didn't match an airport code, a station code or a town name. Link one to the right place once and every booking with that spelling joins the map."
              : "These spellings didn't match an airport code, a station code or a town name. The travel desk can link them to the right place."}>
              <ul className="flex flex-wrap gap-2">
                {data.not_on_map.map((n) => (
                  <li key={n.label}>
                    {canLink ? (
                      <button type="button" className="bi-tag bi-tag-action" onClick={() => setLinking(n.label)}><MapPinOff size={11} aria-hidden /> {n.label} <span className="opacity-60">· {n.bookings}</span> <Link2 size={11} aria-hidden /></button>
                    ) : (
                      <span className="bi-tag"><MapPinOff size={11} aria-hidden /> {n.label} <span className="opacity-60">· {n.bookings}</span></span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Places" note="Arrivals = bookings whose final stop is here">
              <div className="bi-scroll">
                <table className="bi-table">
                  <thead><tr><th>Place</th><th className="text-right">Arrivals</th><th className="text-right">Departures</th><th className="text-right">Travellers</th><th className="text-right">Spend</th></tr></thead>
                  <tbody>
                    {places.map((p) => (
                      <tr key={p.key} className={selected === p.key ? "bi-row-on" : ""}>
                        <td><button type="button" className="bi-linkish" onClick={() => setSelected(selected === p.key ? null : p.key)}>{p.name}</button>
                          <div className="table-subline">{countryName(p.country)}</div></td>
                        <td className="text-right">{count(p.visits)}</td><td className="text-right">{count(p.departures)}</td>
                        <td className="text-right">{count(p.travellers)}</td><td className="text-right">{formatMoney(p.spend, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Most travelled journeys" note="From the first to the last stop of each booking. Average cost uses bookings with a cost only.">
              <div className="bi-scroll">
                <table className="bi-table">
                  <thead><tr><th>Journey</th><th className="text-right">Bookings</th><th className="text-right">Avg cost</th><th className="text-right">Spend</th></tr></thead>
                  <tbody>
                    {data.journeys.map((j) => (
                      <tr key={`${j.from_name}>${j.to_name}`}>
                        <td>{j.from_name} → {j.to_name}{j.has_connections && <div className="table-subline">includes connections</div>}</td>
                        <td className="text-right">{count(j.bookings)}</td>
                        <td className="text-right">{j.avg_cost == null ? "—" : formatMoney(j.avg_cost, cur)}{j.costed < j.bookings && <div className="table-subline">{j.costed} of {j.bookings} costed</div>}</td>
                        <td className="text-right">{formatMoney(j.spend, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Countries" note="Bookings that start, end or connect in each country">
              <ul className="grid gap-3">
                {data.countries.map((c) => (
                  <li key={c.country} className="text-sm">
                    <div className="flex justify-between gap-2"><span>{countryName(c.country)}</span><span><strong>{count(c.bookings)}</strong> <span className="opacity-60">{c.bookings === 1 ? "booking" : "bookings"} · {plural(c.travellers, "traveller")}</span></span></div>
                    <ShareBar value={c.bookings} max={data.countries[0]?.bookings ?? 0} color={c.country === data.home_country ? "var(--blue)" : "var(--saffron)"} />
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="By travel type">
              <table className="bi-table">
                <thead><tr><th>Type</th><th className="text-right">Bookings</th><th className="text-right">International</th><th className="text-right">Spend</th></tr></thead>
                <tbody>{data.categories.map((c) => <tr key={c.category}><td>{labelFor(c.category)}</td><td className="text-right">{count(c.bookings)}</td><td className="text-right">{count(c.international)}</td><td className="text-right">{formatMoney(c.spend, cur)}</td></tr>)}</tbody>
              </table>
            </Panel>
          </div>
        </div>
      ))}
      {linking && <LinkPlaceDialog label={linking} onClose={() => setLinking(null)} onDone={() => { setLinking(null); load(); }} />}
    </div>
  );
}

function LinkPlaceDialog({ label, onClose, onDone }: { label: string; onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState(label);
  const [hits, setHits] = useState<LocationHit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    const t = setTimeout(() => { searchLocations(q).then(setHits).catch((err) => setError(err instanceof Error ? err.message : "Search failed.")); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function pick(h: LocationHit) {
    setBusy(true);
    setError("");
    try {
      await linkPlace(label, h.id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link the place.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="link-place-title">
      <div className="confirm-dialog max-w-xl w-full text-left max-h-[90vh] overflow-y-auto">
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">PUT A PLACE ON THE MAP</span>
        <h2 id="link-place-title">Where is “{label}”?</h2>
        <p className="text-xs opacity-70 mt-1">Search by town, airport or station name or code, then pick the right one. Every booking that says “{label}” will use it.</p>
        <label className="field mt-4 relative">
          <span>Search places</span>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="For example Tiruchirappalli or TRZ" />
          <Search size={14} className="absolute right-3 bottom-3.5 opacity-50" aria-hidden />
        </label>
        <ul className="mt-3 grid gap-1 max-h-72 overflow-y-auto">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className="bi-hit" disabled={busy} onClick={() => void pick(h)}>
                <strong>{h.name}</strong>{h.code && <span className="bi-tag ml-1">{h.code}</span>}
                <span className="table-subline block">{h.kind === "airport" ? "Airport" : h.kind === "station" ? "Railway station" : "Town or city"}{h.city && h.kind === "airport" ? ` · ${h.city}` : ""}{h.region ? ` · ${h.region}` : ""} · {countryName(h.country)} · {Number(h.lat).toFixed(3)}, {Number(h.lng).toFixed(3)}</span>
              </button>
            </li>
          ))}
          {query.trim().length >= 2 && hits.length === 0 && <li className="text-sm opacity-70 p-2">No matching places.</li>}
        </ul>
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}
