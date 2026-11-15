import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, CalendarDays, FileText, Info } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { LEGAL_DETAILS, LEGAL_PAGES, legalPageFor } from "./legalInfo";
import { LEGAL_CONTENT } from "./legalContent";

/**
 * One layout for the six legal and information pages. Open to everyone, signed in
 * or not (App.tsx lets these paths through before the sign-in check).
 * Styles: "Legal pages" block at the end of nav-rail.css.
 */
export default function LegalPage({ path, backHref, backLabel }: { path: string; backHref: string; backLabel: string }) {
  const page = legalPageFor(path) ?? LEGAL_PAGES[0];
  const sections = LEGAL_CONTENT[page.slug];

  useEffect(() => {
    const previous = document.title;
    document.title = page.title;
    return () => {
      document.title = previous;
    };
  }, [page.title]);

  useEffect(() => {
    // A new page starts at the top, unless the link points at a section.
    if (!window.location.hash) window.scrollTo({ top: 0 });
  }, [page.slug]);

  return (
    <div className="legal-shell">
      <a href="#legal-content" className="legal-skip">Skip to content</a>
      <header className="legal-topbar">
        <Link href={backHref} className="legal-home" aria-label={backLabel}>
          <Logo light={false} />
        </Link>
        <Link href={backHref} className="button button-ghost legal-back">
          <ArrowLeft size={15} aria-hidden="true" /> {backLabel}
        </Link>
      </header>

      <main className="legal-main" id="legal-content" tabIndex={-1}>
        <div className="legal-hero">
          <span className="card-kicker">{page.kicker}</span>
          <h1>{page.label}</h1>
          <p>{page.summary}</p>
          <div className="legal-meta">
            <span><CalendarDays size={13} aria-hidden="true" /> Last updated {LEGAL_DETAILS.lastUpdated}</span>
            <span><FileText size={13} aria-hidden="true" /> Applies to Trapple, run by {LEGAL_DETAILS.companyName}</span>
          </div>
          {!LEGAL_DETAILS.legalReviewed && page.slug !== "contact" && (
            <p className="legal-review-note">
              <Info size={14} aria-hidden="true" />
              <span>This page describes how Trapple works today and is awaiting review by the company&apos;s legal adviser. It may be updated after that review.</span>
            </p>
          )}
        </div>

        <div className="legal-layout">
          <aside className="legal-aside">
            <nav aria-label="On this page" className="legal-toc">
              <span className="eyebrow">On this page</span>
              <ol>
                {sections.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`}>{s.heading}</a></li>
                ))}
              </ol>
            </nav>
            <nav aria-label="Other legal pages" className="legal-toc legal-toc-other">
              <span className="eyebrow">Legal &amp; Information</span>
              <ul>
                {LEGAL_PAGES.map((p) => (
                  <li key={p.href}>
                    <Link href={p.href} aria-current={p.href === page.href ? "page" : undefined}>{p.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="legal-article panel">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="legal-section" aria-labelledby={`${s.id}-title`}>
                <h2 id={`${s.id}-title`}>{s.heading}</h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
