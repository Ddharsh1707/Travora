import { useEffect, useState } from "react";
import { ArrowRight, Calculator, ChevronDown } from "lucide-react";
import { Link } from "wouter";
import { getInsights, type BiFilters, type Insight } from "../../lib/data/bi";

/**
 * Facts worked out from the bookings, each with its calculation. Trapple does
 * not suggest causes: anything beyond the numbers is for people to judge.
 */
export default function BiInsights({ filters }: { filters: BiFilters }) {
  const [items, setItems] = useState<Insight[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setError("");
    getInsights(filters).then((x) => { if (live) setItems(x); }).catch((err) => { if (live) setError(err instanceof Error ? err.message : "Could not work out the insights."); });
    return () => { live = false; };
  }, [filters]);

  if (error) return <p className="text-xs opacity-70" role="alert">{error}</p>;
  if (!items || items.length === 0) return null;
  return (
    <section className="panel p-4" aria-labelledby="bi-insights-title">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h2 id="bi-insights-title" className="section-heading inline-flex items-center gap-2"><Calculator size={15} aria-hidden /> Facts from your data</h2>
          <p className="text-xs opacity-70 mt-0.5">Each line is a calculation on the bookings shown. Open one to see how it was worked out. Reasons and next steps are for you to judge; Trapple doesn't guess them.</p>
        </div>
      </div>
      <ul className="bi-insights">
        {items.map((i) => (
          <li key={i.id} className={`bi-insight bi-insight-${i.kind}`}>
            <button type="button" className="bi-insight-head" aria-expanded={open === i.id} onClick={() => setOpen(open === i.id ? null : i.id)}>
              <span>{i.title}</span>
              <ChevronDown size={14} aria-hidden className={open === i.id ? "rotate-180" : ""} />
            </button>
            {open === i.id && (
              <div className="bi-insight-body">
                <p><strong>How it's calculated:</strong> {i.basis}</p>
                <Link href={i.link} className="text-link">See the figures <ArrowRight size={12} /></Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
