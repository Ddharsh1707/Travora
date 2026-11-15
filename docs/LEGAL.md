# Legal and information pages

Trapple has six public pages, linked from the footer on every screen:

| Page | Address |
| --- | --- |
| Privacy Policy | `/privacy-policy` |
| Terms & Conditions | `/terms-and-conditions` |
| Cookie Policy | `/cookie-policy` |
| Data We Collect | `/data-we-collect` |
| Cancellation & Refund Policy | `/cancellation-and-refund-policy` |
| Contact Us | `/contact` |

Anyone can open them, signed in or not.

## Where things live

- `client/src/pages/legal/legalInfo.ts`: the page list and **all company details** (`LEGAL_DETAILS`).
  A value set to `null` is not shown anywhere, and the pages use wording that doesn't need it.
- `client/src/pages/legal/legalContent.tsx`: the text of the six pages.
- `client/src/pages/legal/LegalPage.tsx`: the page layout.
- `client/src/components/SiteFooter.tsx`: the one footer used on every page.
- Styles: the "Site footer" and "Legal pages" blocks at the end of `client/src/nav-rail.css`.
- Tests: `client/src/__tests__/legal_pages.test.ts`.

The text describes how Trapple works **today**. It was checked against the database schema, the
Edge Functions and the browser code in November 2026. If Trapple starts collecting something new,
uses a new service provider or sets a cookie, update `legalContent.tsx` and `lastUpdated` in the
same pull request.

## Waiting for the owner

These details are not in the app and must not be guessed. Fill them in `LEGAL_DETAILS` once confirmed.

| Item | Now | Needed |
| --- | --- | --- |
| Support email | `desk@mahathiinfra.com` (already shown on the sign-in page) | Confirm it is a real, monitored mailbox |
| Privacy contact | Falls back to the support email | A dedicated address, if the company wants one |
| Grievance officer | Not shown; complaints go to the Travel Desk | Name, role and email (DPDP Rules, 2025) |
| Registered office | Only "Hyderabad, Telangana, India" is shown | Full registered address |
| CIN | Not shown | Optional |
| Support phone | Not shown | Optional |
| Retention periods | Page says records are kept until removed, and the period is the company's decision | How long travel, expense and audit records are kept |
| Refund and reimbursement rules | Page says these follow the provider's rules and the company's travel policy | Who bears cancellation charges, reimbursement timelines |
| Legal review | Each policy page shows "awaiting review by the company's legal adviser" | Set `legalReviewed: true` after a lawyer has reviewed the pages |

## Facts the pages rely on

- The database, sign-in and file storage are on Supabase, in the **Tokyo, Japan** region
  (`ap-northeast-1`). The website is served by AWS Amplify.
- The AI scanner and assistant currently use **Groq**. Gemini and Anthropic can be switched on with
  Supabase secrets. If that changes, update the "Service providers" section.
- No cookies are set. The browser keeps `trapple-auth` (sign-in, session storage), `trapple_theme`,
  `trapple_sidebar_collapsed`, `trapple-ai-launcher-hidden` (local storage) and
  `trapple-bi-filters` (session storage). Fonts load from Google Fonts. There is no analytics.

## Opening a page directly

The pages work when reached from a link inside the app. For a typed or shared address
(for example `https://…/privacy-policy`) to load, Amplify Hosting needs a single-page-app rewrite:
Amplify console → the app → **Hosting → Rewrites and redirects** → add
source `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>`,
target `/index.html`, type **200 (Rewrite)**. The same rule lets every other page in the app
survive a browser refresh.
