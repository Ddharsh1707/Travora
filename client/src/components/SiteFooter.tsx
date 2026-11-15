import { Link, useLocation } from "wouter";
import { Mail } from "lucide-react";
import { Logo } from "./Logo";
import { LEGAL_DETAILS, LEGAL_PAGES, mailto, normaliseLegalPath } from "@/pages/legal/legalInfo";

/**
 * The one footer used across Trapple: the public pages, the sign-in page, the legal
 * pages and every signed-in portal. It sits in the normal page flow after the content
 * (never fixed or floating); the page shells push it to the bottom of short pages.
 * Styles: "Site footer" block at the end of nav-rail.css.
 */
export function SiteFooter({ className = "" }: { className?: string }) {
  const [location] = useLocation();
  const here = normaliseLegalPath(location);
  const support = mailto(LEGAL_DETAILS.supportEmail);
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Logo light />
          <p className="site-footer-tagline">Employee Travel Desk Management System</p>
          <p className="site-footer-org">
            {LEGAL_DETAILS.companyName} · {LEGAL_DETAILS.city.replace(/, India$/, "")}
          </p>
          {support && LEGAL_DETAILS.supportEmail && (
            <a className="site-footer-mail" href={support}>
              <Mail size={13} aria-hidden="true" /> {LEGAL_DETAILS.supportEmail}
            </a>
          )}
        </div>
        <nav className="site-footer-nav" aria-label="Legal and information">
          <span className="site-footer-heading">Legal &amp; Information</span>
          <ul>
            {LEGAL_PAGES.map((page) => (
              <li key={page.href}>
                <Link href={page.href} aria-current={here === page.href ? "page" : undefined}>
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} Trapple. All rights reserved.</span>
        <span>Run by {LEGAL_DETAILS.companyName} for its employees and site teams.</span>
      </div>
    </footer>
  );
}

export default SiteFooter;
