# Working on Trapple (Travora)

Read this before changing anything. More than one Claude account works on this
repository, and the people who own it want the **existing look and behaviour
kept exactly as it is**. New features must look like they were always part of the app.

The live site is **https://main.d27refhdsen811.amplifyapp.com** (AWS Amplify Hosting).
Amplify builds and deploys `main` on every push. Anything merged to `main` is live
within minutes. The Vercel address (travora-ashy.vercel.app) is the old host.

See `README.md` for what the app does, the workflow and the architecture.

---

## 1. The design is frozen

Do **not** change, restyle or "improve" anything that already exists unless the
person explicitly asks for that specific change. That includes:

- fonts, font sizes, colours, spacing, radii, shadows, animations
- the CSS variables / theme tokens
- the nav rail, top bar, page headers, tables, buttons, modals, pills
- wording and labels on existing screens
- existing components' props and behaviour

Do not run `pnpm format` (Prettier) over the repo, and do not reformat files you
touch. Only the lines your feature needs should appear in the diff.

### How the styling works (so new screens match)

CSS is loaded in this order (`client/src/main.tsx`). Later files win:

1. `client/src/index.css`: Tailwind v4 (`@import "tailwindcss"`), the `@theme`
   block (the Tailwind `teal-*` scale is **remapped to brand amber**, and
   `emerald-*` is the process teal), base classes. It also imports
   `theme-polish.css` and `responsive.css`.
2. `client/src/terminal.css`: the **Mahathi Energy theme**. It holds the real
   tokens and the `.dark` overrides. This is the source of truth for colours and fonts.
3. `client/src/nav-rail.css`: the slim icon sidebar and fly-outs, plus some newer
   pieces (e.g. `.ticket-strip`).

Tokens to use (never hard-code a new hex colour):

| Purpose | Use |
| --- | --- |
| Page / card backgrounds | `var(--paper)`, `var(--surface)`, `var(--surface-soft)`, `var(--surface-muted)`, `var(--surface-hover)` |
| Text | `var(--ink)`, `var(--ink-soft)`, `var(--ink-muted)` |
| Borders | `var(--line)`, `var(--line-strong)` |
| Accent (amber) | `var(--saffron)` / `var(--amber)`, `var(--saffron-soft)`, `var(--amber-ink)` |
| Data / success teal | `var(--process)`, `var(--process-soft)`, `var(--blue)` (teal in this theme) |
| Dark panels | `var(--navy)`, `var(--navy-gradient)` |
| Status colours | `var(--green)`, `var(--red)` |
| Radius / shadow / motion | `var(--radius*)`, `var(--shadow-sm/md/lg)`, `var(--ease)` |
| Fonts | `var(--font-sans)` (IBM Plex Sans), `var(--font-heading)` (Archivo), `var(--font-mono)` (IBM Plex Mono) |

All of these tokens already have dark-mode values, so using them makes a new screen
work in dark mode automatically. Dark mode is the `.dark` class on `<html>`,
toggled in-app (`contexts/ThemeContext.tsx`). In Tailwind, use `dark:` utilities,
which follow that class.

### Building a new screen: reuse what exists

Copy the structure of an existing page in `client/src/pages/travel/` (for example
`RequestTickets.tsx`, `MyExpenses.tsx`, `BiProjects.tsx`). Use:

- **Layout:** `<div className="page-stack animate-page">` … sections inside
  `panel` / `table-panel` cards, `section-heading`, `table-toolbar`.
- **Shared components** from `pages/travel/common.tsx`: `PageHeader`, `Stat`,
  `Loading`, `ErrorNotice`, `Empty`, `StatusPill`, `formatMoney` (INR),
  `formatDate` (en-IN), `routeLabel`, `labelFor`.
- **Buttons:** `button button-primary`, `button button-ghost`, `icon-button`, `table-action`.
- **Forms:** `field` wrappers (label `<span>` + input/select/textarea), `form-grid`.
- **Tables:** `responsive-table` or `bi-table`, `table-subline` for second lines.
- **Labels:** `card-kicker`, `eyebrow`. Status: `approval-pill <tone>` via `StatusPill`.
- **Pop-ups:** wrap in `components/ModalPortal.tsx`, with `modal-overlay` /
  `confirm-dialog` / `dialog-actions` / `dialog-close`.
- **Toasts:** `toast` from `sonner`. **Icons:** `lucide-react` only, size 13–19.
- **Charts:** Recharts, coloured with the tokens above.
- Small Tailwind utilities for layout (`flex`, `grid`, `gap-*`, `mt-*`, `text-xs`,
  `opacity-70` …) are fine and widely used.

If a new screen truly needs new CSS, add it in a **new, clearly commented block at
the end of `client/src/nav-rail.css`**, using only the tokens above and classes
with a feature-specific prefix (e.g. `.trip-planner-…`). Never edit existing
rules to make a new feature fit.

---

## 2. Architecture rules

- **Frontend:** React 19 + TypeScript + Vite 7 + Tailwind v4 + wouter, in `client/`.
  The live site runs with `VITE_AUTH_PROVIDER=supabase`.
- **New screens** go in `client/src/pages/travel/`, lazy-loaded in
  `pages/travel/routes.tsx`. To add one, add a `lazy(() => import(...))`, an entry in
  `ROUTES` (group, href, label, icon, roles), and an entry in `travelPageMeta`.
  Add a line; do not reorder or rename existing entries.
- **Data access** goes in `client/src/lib/data/<area>.ts`: functions that call
  `getSupabase()`, validate input with `zod`, and map errors with `friendlyError`.
  Pages never build queries inline. For live updates use
  `useLiveRefresh([tables], reload)` from `lib/data/reports.ts`.
- **Database changes** go in a **new** migration in `supabase/migrations/`. Never
  edit an existing migration; they are already applied to the live database.
  - Name it `YYYYMMDDHHMMSS_short_name.sql` with a timestamp **later than every
    existing file on `origin/main`** (check right before you commit, because the
    other account may have added one).
  - Start with the header comment block other migrations use (what it does, who
    can do what, "Safe to run more than once") and make it re-runnable
    (`if not exists`, `create or replace`).
  - RLS on every new table. Writes that need rules go through a `security definer`
    function with `set search_path = ''`, using the helpers in the `private`
    schema (`private.current_profile_id()`, `private.current_app_role()`,
    `private.is_staff()`, `private.is_manager()`, `private.can_view_employee()`,
    `private.write_audit()` …).
  - Add RLS tests in `supabase/tests/` and list a new test file in `run_local.sh`.
- **Edge Functions** (`supabase/functions/`) deploy to the live project automatically
  when merged to `main`. Keys stay in Supabase secrets; never put a key in the
  repo or in a `VITE_` variable.
- **Roles:** `employee`, `approver`, `travel_desk` ("Booking assistant"),
  `company_admin` (shown as **Travel Desk**), `admin` (shown as **Director**). The
  database enforces permissions; UI role checks only decide what is shown.
- Do not touch the legacy path (`backend/`, `client/src/lib/api.ts`, the legacy
  parts of `client/src/App.tsx`) unless asked.

---

## 3. Working alongside the other Claude account

Two Claude accounts push to this repo: one signed in to GitHub as **Ddharsh1707**
(the owner) and one as **Haripreeth27** (a collaborator). Neither can see the
other's chats, so **GitHub is the shared workspace**. Open pull requests are the
task board, and this file holds the rules. Follow this routine for every task:

1. **Look at the board.** List open PRs, including drafts:
   `gh api repos/Ddharsh1707/travora/pulls --jq '.[] | "#\(.number) [\(.user.login)] \(.title) draft=\(.draft)"'`
   Then read the "Files touched" section of each one (`gh api repos/Ddharsh1707/travora/pulls/<n> --jq .body`).
   If another PR already covers the same feature, stop and tell the person.
2. **Start from the newest `main`:** `git fetch origin main`, then
   `git checkout -b claude/<short-feature-name> origin/main`.
3. **Claim the work straight away.** Push the branch, even with only a first
   commit, and open a **draft PR** using the template (`.github/pull_request_template.md`).
   Fill in "Files touched" with every file you expect to change. This is how the
   other account knows those files are taken.
4. **Don't edit files another open PR has claimed.** If you must, keep the change
   to added lines only and mention the other PR number in your PR description.
5. **Keep diffs small and local.** Prefer new files over edits to shared files.
   The shared hot spots are `client/src/App.tsx`, `pages/travel/routes.tsx`, the
   CSS files and `supabase/functions/_shared/`. Touch them only by adding lines.
6. **Finish:** rebase on the newest `origin/main`, run the checks in section 4,
   update "Files touched", and mark the PR ready with `gh pr ready <n>`.
   Then turn on auto-merge with `gh pr merge <n> --auto --squash`. GitHub merges
   the PR by itself once all four required checks in the `Protect main` ruleset
   pass. No human approval is needed for an ordinary PR. If `main` moves first,
   update the branch (rebase on `origin/main` and push again); auto-merge stays on.
   **Leave auto-merge off and ask the person to merge** when the PR adds a database
   migration, changes an Edge Function, or changes RLS, auth or anything under
   `.github/`. Edge Functions deploy straight to the live project on merge, and
   migrations are applied to the live database by hand.
7. **Never push straight to `main`**, never force-push someone else's branch, and
   never revert, rewrite or "clean up" someone else's recent work.

The `Migrations` job in `checks.yml` (`scripts/check-migrations.sh`) blocks any PR
that edits an already-applied migration or adds one that doesn't sort after the
newest migration on `main`. If it fails after the other account merged a newer
migration, rename yours with a later timestamp.

---

## 4. Before every push

Run all of these and fix any failure:

```bash
pnpm check      # TypeScript
pnpm test       # app tests (client/src/__tests__/*.test.ts, node:test + tsx)
pnpm build      # production build
```

and, if you changed the database, `pnpm test:rls`. Add a test in
`client/src/__tests__/` for new data logic (pure functions, zod validation).
The same checks run in GitHub Actions on every PR (`.github/workflows/checks.yml`),
along with `bash scripts/check-migrations.sh origin/main`, which you can run locally too.

Write user-facing text in the same plain, friendly English as the rest of the app.
Money is INR and dates are en-IN.
