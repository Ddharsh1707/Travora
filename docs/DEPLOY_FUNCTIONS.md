# Connect the AI assistant from GitHub (no terminal)

The workflow `.github/workflows/deploy-functions.yml` saves your AI key into Supabase and
deploys the app's server functions (`admin-users`, `ai-assistant`, `document-extract`).
You only set it up once, in the GitHub website.

## 1. Get a free Groq key

1. Open https://console.groq.com/keys and sign in (Google sign-in works, no card needed).
2. Click **Create API Key**, name it `Trapple`, click **Submit**.
3. Copy the key (it starts with `gsk_`). Groq shows it only once.

## 2. Get a Supabase access token

1. Open https://supabase.com/dashboard/account/tokens (signed in to the account that owns the Trapple project).
2. Click **Generate new token**, name it `GitHub deploy`, pick an expiry, click **Generate token**.
3. Copy the token (it starts with `sbp_`).

## 3. Paste both into GitHub

1. Open https://github.com/Ddharsh1707/Travora/settings/secrets/actions
   (repo → **Settings** → **Secrets and variables** → **Actions**).
2. Click **New repository secret**. Name: `GROQ_API_KEY`. Secret: the `gsk_...` key. Click **Add secret**.
3. Click **New repository secret** again. Name: `SUPABASE_ACCESS_TOKEN`. Secret: the `sbp_...` token. Click **Add secret**.

Names must be typed exactly as shown. Only the repo owner (or an admin) can see this page.

Optional: `GEMINI_API_KEY` (from https://aistudio.google.com/apikey) as a backup when Groq is busy,
and `SUPABASE_PROJECT_REF` if the app ever moves to a different Supabase project
(the default is the live project, `lbxqiifssfgpfqgdvbmh`).

## 4. Run it

1. Open https://github.com/Ddharsh1707/Travora/actions/workflows/deploy-functions.yml
2. Click **Run workflow** → keep branch `main` → click the green **Run workflow**.
3. Wait about 2 minutes for the green tick. The run's summary says which keys were saved.
4. Open the app, sign in as Director or Travel Desk, and ask the AI assistant a question.

After this, the functions redeploy by themselves whenever a change to them is merged into `main`.
To change the key later, edit the `GROQ_API_KEY` secret and run the workflow again.

## If it goes red

- **"Nothing deployed" warning**: `SUPABASE_ACCESS_TOKEN` is missing or misspelled.
- **401 / Unauthorized**: the Supabase token expired or belongs to an account without access to the project. Make a new one and update the secret.
- **Assistant still says no AI key**: check `GROQ_API_KEY` is spelled exactly, then run the workflow again.
