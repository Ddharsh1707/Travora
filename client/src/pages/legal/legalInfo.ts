/**
 * Legal and information pages: the list of pages, and the company details they show.
 *
 * Everything a lawyer or the owner may need to change lives in LEGAL_DETAILS below.
 * A value set to null is not shown anywhere; the pages fall back to wording that
 * does not depend on it. Never fill a value in with a guess: only details the
 * owner has confirmed belong here. See docs/LEGAL.md for what is still open.
 */

export type LegalSlug =
  | "privacy-policy"
  | "terms-and-conditions"
  | "cookie-policy"
  | "data-we-collect"
  | "cancellation-and-refund-policy"
  | "contact";

export type LegalPageInfo = {
  slug: LegalSlug;
  href: string;
  /** Link text in the footer and the page heading. */
  label: string;
  /** Browser tab title. */
  title: string;
  kicker: string;
  summary: string;
};

export const LEGAL_PAGES: LegalPageInfo[] = [
  {
    slug: "privacy-policy",
    href: "/privacy-policy",
    label: "Privacy Policy",
    title: "Privacy Policy · Trapple",
    kicker: "Legal",
    summary: "What personal information Trapple holds, why, who can see it, where it is stored and the choices you have.",
  },
  {
    slug: "terms-and-conditions",
    href: "/terms-and-conditions",
    label: "Terms & Conditions",
    title: "Terms & Conditions · Trapple",
    kicker: "Legal",
    summary: "The rules for using Trapple: accounts, requests, approvals, bookings and what each role is responsible for.",
  },
  {
    slug: "cookie-policy",
    href: "/cookie-policy",
    label: "Cookie Policy",
    title: "Cookie Policy · Trapple",
    kicker: "Legal",
    summary: "Trapple does not set cookies. This page lists the small amount of browser storage it does use, and why.",
  },
  {
    slug: "data-we-collect",
    href: "/data-we-collect",
    label: "Data We Collect",
    title: "Data We Collect · Trapple",
    kicker: "Information",
    summary: "Each kind of information in Trapple, why it is needed, where it is used and which roles can see it.",
  },
  {
    slug: "cancellation-and-refund-policy",
    href: "/cancellation-and-refund-policy",
    label: "Cancellation & Refund Policy",
    title: "Cancellation & Refund Policy · Trapple",
    kicker: "Policy",
    summary: "How cancellations are recorded in Trapple, and who decides refunds and reimbursements.",
  },
  {
    slug: "contact",
    href: "/contact",
    label: "Contact Us",
    title: "Contact Us · Trapple",
    kicker: "Support",
    summary: "Who runs Trapple and how to reach the travel desk about support, privacy or a complaint.",
  },
];

export const LEGAL_DETAILS = {
  /** The company that runs Trapple and decides how its data is used. */
  companyName: "Mahathi Infra Services Pvt. Ltd.",
  companyShortName: "Mahathi Infra Services",
  city: "Hyderabad, Telangana, India",
  /** Shown on the sign-in page since November 2026. */
  supportEmail: "desk@mahathiinfra.com" as string | null,
  /** A dedicated privacy address. Until it is set, privacy questions go to supportEmail. */
  privacyEmail: null as string | null,
  /** Name, role and email of the grievance officer, once the company appoints one. */
  grievanceOfficer: null as { name: string; role: string; email: string } | null,
  /** Full registered office address. */
  registeredAddress: null as string | null,
  /** CIN from the company's registration, if the owner wants it shown. */
  cin: null as string | null,
  supportPhone: null as string | null,
  /** Where the database and uploaded files are kept (Supabase project region). */
  dataRegion: "Tokyo, Japan",
  lastUpdated: "15 November 2026",
  /** Set to true once a lawyer has reviewed these pages. Until then each page says so. */
  legalReviewed: false,
};

const LEGAL_PATHS = new Set(LEGAL_PAGES.map((p) => p.href));

/** Normalises a path for matching: no query or hash, no trailing slash. */
export function normaliseLegalPath(path: string): string {
  const bare = path.split(/[?#]/)[0] || "/";
  return bare.length > 1 ? bare.replace(/\/+$/, "") || "/" : bare;
}

/** True for the six legal and information pages, which anyone can open without signing in. */
export function isLegalPath(path: string): boolean {
  return LEGAL_PATHS.has(normaliseLegalPath(path));
}

export function legalPageFor(path: string): LegalPageInfo | undefined {
  const p = normaliseLegalPath(path);
  return LEGAL_PAGES.find((page) => page.href === p);
}

/** Where privacy questions should go: the privacy address, else the support address. */
export function privacyContactEmail(details: Pick<typeof LEGAL_DETAILS, "privacyEmail" | "supportEmail"> = LEGAL_DETAILS): string | null {
  return details.privacyEmail ?? details.supportEmail;
}

/** "mailto:" link with an optional subject, or null when there is no address. */
export function mailto(email: string | null, subject?: string): string | null {
  if (!email) return null;
  return subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
}
