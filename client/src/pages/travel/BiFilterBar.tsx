import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { getFilterOptions, type BiFilters, type FilterOptions } from "../../lib/data/bi";
import { labelFor } from "./common";

let cached: Promise<FilterOptions> | null = null;
function loadOptions(): Promise<FilterOptions> {
  if (!cached) cached = getFilterOptions().catch((err) => { cached = null; throw err; });
  return cached;
}

/** Filters shared by every Business Intelligence page. */
export default function BiFilterBar({ filters, onChange, hide = [] }: {
  filters: BiFilters;
  onChange: (f: BiFilters) => void;
  hide?: (keyof BiFilters)[];
}) {
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    loadOptions().then((o) => { if (live) setOptions(o); }).catch((err) => { if (live) setError(err instanceof Error ? err.message : "Could not load the filters."); });
    return () => { live = false; };
  }, []);

  const set = (key: keyof BiFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...filters, [key]: e.target.value || undefined });
  const shown = (key: keyof BiFilters) => !hide.includes(key);
  const active = Object.entries(filters).filter(([k, v]) => v && !hide.includes(k as keyof BiFilters)).length;

  return (
    <div className={`panel bi-filters ${open ? "is-open" : ""}`} role="search" aria-label="Filters">
      <button type="button" className="bi-filters-title" aria-expanded={open} onClick={() => setOpen((o) => !o)}><SlidersHorizontal size={14} aria-hidden /> Filters{active > 0 && <span className="bi-count">{active}</span>}</button>
      <label className="bi-filter"><span>From</span><input type="date" value={filters.from ?? ""} min={options?.first_date ?? undefined} onChange={set("from")} /></label>
      <label className="bi-filter"><span>To</span><input type="date" value={filters.to ?? ""} max={options?.last_date ?? undefined} onChange={set("to")} /></label>
      {shown("project") && (
        <label className="bi-filter"><span>Project</span>
          <select value={filters.project ?? ""} onChange={set("project")}>
            <option value="">All projects</option>
            <option value="unassigned">Unassigned</option>
            {options?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {shown("department") && (
        <label className="bi-filter"><span>Department</span>
          <select value={filters.department ?? ""} onChange={set("department")}>
            <option value="">All departments</option>
            {options?.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      )}
      {shown("employee") && (
        <label className="bi-filter"><span>Employee</span>
          <select value={filters.employee ?? ""} onChange={set("employee")}>
            <option value="">All employees</option>
            {options?.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
      )}
      {shown("destination") && (
        <label className="bi-filter"><span>Destination</span>
          <select value={filters.destination ?? ""} onChange={set("destination")}>
            <option value="">All places</option>
            {options?.destinations.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      )}
      {shown("category") && (
        <label className="bi-filter"><span>Travel type</span>
          <select value={filters.category ?? ""} onChange={set("category")}>
            <option value="">All types</option>
            {options?.categories.map((c) => <option key={c} value={c}>{labelFor(c)}</option>)}
          </select>
        </label>
      )}
      <button type="button" className="button button-ghost bi-reset" onClick={() => onChange({})} disabled={active === 0}><RotateCcw size={13} /> Clear</button>
      {error && <p className="text-xs text-red-600 w-full" role="alert">{error}</p>}
    </div>
  );
}
