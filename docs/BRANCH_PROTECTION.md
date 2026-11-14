# Protecting the main branch

`main` is what goes live. These settings stop anyone from overwriting it (a force push)
or merging a change that fails the automatic checks in `.github/workflows/checks.yml`.

Only the repository owner (Ddharsh1707) or an admin can change them.

## Before you start

Merge the pull request that adds `.github/workflows/checks.yml` first. GitHub only lets you
pick a check as "required" after it has run at least once.

## Steps (about 3 minutes)

1. Open https://github.com/Ddharsh1707/Travora/settings/rules (Settings > Rules > Rulesets).
2. Click **New ruleset** > **New branch ruleset**.
3. **Ruleset name:** `Protect main`. **Enforcement status:** `Active`.
4. **Bypass list:** leave it empty, so the rules apply to everyone, owner included.
5. **Target branches:** click **Add target** > **Include default branch**.
6. Under **Branch rules**, tick:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging** (set required approvals to `0` if you work alone,
     or `1` if a second person should review)
   - **Require status checks to pass**, then tick **Require branches to be up to date before merging**,
     click **Add checks** and add all four:
     - `App (types, tests, build)`
     - `Database security (RLS tests)`
     - `Edge Functions (Deno type check)`
     - `Migrations (no edits to applied files, new files sort last)`
7. Click **Create**.

## Also worth doing

- Settings > Collaborators: remove anyone who should no longer push to this repository.
- Settings > Actions > General: keep "Allow all actions" (or allow `actions/*`, `pnpm/*` and `denoland/*`),
  otherwise the checks cannot run.

## How to tell it works

Open any pull request. At the bottom you will see the four checks running. The **Merge** button stays
grey until all four are green, and `git push --force` to main is refused.
