import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";

// The page text is JSX; the test runner compiles JSX to React.createElement.
(globalThis as { React?: unknown }).React = React;
const { LEGAL_DETAILS, LEGAL_PAGES, isLegalPath, legalPageFor, mailto, normaliseLegalPath, privacyContactEmail } = await import("../pages/legal/legalInfo");
const { LEGAL_CONTENT } = await import("../pages/legal/legalContent");

const EXPECTED = [
  "/privacy-policy",
  "/terms-and-conditions",
  "/cookie-policy",
  "/data-we-collect",
  "/cancellation-and-refund-policy",
  "/contact",
];

test("the six legal and information pages, in footer order", () => {
  assert.deepEqual(LEGAL_PAGES.map((p) => p.href), EXPECTED);
  assert.equal(new Set(LEGAL_PAGES.map((p) => p.label)).size, 6, "labels are unique");
  for (const p of LEGAL_PAGES) {
    assert.equal(p.href, `/${p.slug}`);
    assert.ok(p.title.endsWith("· Trapple"), `${p.slug} has a page title`);
    assert.ok(p.summary.length > 20, `${p.slug} has a summary`);
  }
});

test("legal paths are recognised with or without a trailing slash, query or hash", () => {
  for (const href of EXPECTED) {
    assert.ok(isLegalPath(href));
    assert.ok(isLegalPath(`${href}/`), "Amplify may add a trailing slash");
    assert.ok(isLegalPath(`${href}?from=footer`));
    assert.ok(isLegalPath(`${href}#your-rights`));
    assert.equal(legalPageFor(`${href}/`)?.href, href);
  }
  for (const other of ["/", "/login", "/travel/home", "/privacy", "/contact-us", "/privacy-policy/extra", "/admin/contact"]) {
    assert.ok(!isLegalPath(other), `${other} is not a legal page`);
  }
  assert.equal(normaliseLegalPath("/"), "/");
  assert.equal(normaliseLegalPath("/contact///"), "/contact");
});

test("every page has content with unique section ids", () => {
  for (const page of LEGAL_PAGES) {
    const sections = LEGAL_CONTENT[page.slug];
    assert.ok(sections && sections.length >= 3, `${page.slug} has sections`);
    const ids = sections.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${page.slug} section ids are unique`);
    for (const s of sections) {
      assert.match(s.id, /^[a-z0-9-]+$/, "ids are safe for #links");
      assert.ok(s.heading.trim().length > 0);
    }
  }
});

test("privacy questions go to the privacy address, else to the support address", () => {
  assert.equal(privacyContactEmail({ privacyEmail: "p@x.in", supportEmail: "s@x.in" }), "p@x.in");
  assert.equal(privacyContactEmail({ privacyEmail: null, supportEmail: "s@x.in" }), "s@x.in");
  assert.equal(privacyContactEmail({ privacyEmail: null, supportEmail: null }), null);
  assert.equal(mailto(null, "x"), null);
  assert.equal(mailto("a@b.in"), "mailto:a@b.in");
  assert.equal(mailto("a@b.in", "Privacy request"), "mailto:a@b.in?subject=Privacy%20request");
});

test("company details are never guessed: unknown values stay empty", () => {
  assert.equal(LEGAL_DETAILS.companyName, "Mahathi Infra Services Pvt. Ltd.");
  // Filled in only once the owner confirms them (docs/LEGAL.md).
  for (const key of ["registeredAddress", "cin", "supportPhone", "grievanceOfficer", "privacyEmail"] as const) {
    const v = LEGAL_DETAILS[key];
    assert.ok(v === null || (typeof v === "string" ? v.trim().length > 0 : typeof v === "object"), `${key} is either empty or a real value`);
  }
});

test("page text has no placeholders, and every internal link goes to a real page", () => {
  const source = readFileSync(new URL("../pages/legal/legalContent.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /lorem|ipsum|TODO|TBD|xxx|placeholder|example\.com|\[company/i);
  const internal = [...source.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]);
  assert.ok(internal.length > 5, "pages link to each other");
  for (const href of internal) {
    assert.ok(isLegalPath(href) || href === "/login", `${href} is a page that exists`);
  }
});

test("the footer links to every legal page and nothing is fixed in place", () => {
  const footer = readFileSync(new URL("../components/SiteFooter.tsx", import.meta.url), "utf8");
  assert.match(footer, /LEGAL_PAGES\.map/, "footer links come from the one page list");
  const css = readFileSync(new URL("../nav-rail.css", import.meta.url), "utf8");
  const block = css.slice(css.indexOf("Site footer (components/SiteFooter.tsx)"));
  const footerRules = block.slice(0, block.indexOf("Legal pages (pages/legal/LegalPage.tsx)"));
  assert.doesNotMatch(footerRules, /position:\s*(fixed|sticky)/, "the footer stays in the page flow");
});
