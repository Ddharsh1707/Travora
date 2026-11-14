# Deploy Travora on AWS (Amplify Hosting)

This puts the Travora website on AWS instead of Vercel. It uses **AWS Amplify
Hosting**, which builds the site straight from GitHub every time `main`
changes, gives you HTTPS, and serves it worldwide. Supabase stays the backend,
so nothing else moves.

The repo already has what Amplify needs:

| File | What it does |
| --- | --- |
| `amplify.yml` | How to build the site (Node 22, pnpm, `vite build`, output in `dist/public`). |
| `customHttp.yml` | Security and cache headers (the same ones as `vercel.json`). |
| `deploy/aws/amplify-rewrites.json` | Page routing rules to paste into the Amplify console in step 5. |

Time needed: about 20 minutes. Cost: Amplify has a free tier for the first 12
months; a small site like this usually costs a few dollars a month after that.

---

## Before you start

1. **Merge PR #7 first** (phases 4 to 8 into `main`). The strict security
   headers in `customHttp.yml` expect the phase 8 build. Without it, the site
   would load blank.
2. Have these ready from Supabase (**Project Settings → API**):
   - **Project URL**, for example `https://abcd1234.supabase.co`
   - **anon public key** (the long key labelled `anon` / `public`).
     Never use the `service_role` key on the website.

---

## Step 1. Open Amplify

1. Sign in at <https://console.aws.amazon.com>.
2. Top right, pick a region close to your users (for India: **Asia Pacific (Mumbai)**).
3. In the top search bar type **Amplify** and open **AWS Amplify**.

## Step 2. Connect GitHub

1. Click **Create new app** (or **Deploy an app**).
2. Choose **GitHub**, click **Next**, and sign in to GitHub as **Ddharsh1707**
   when asked. Allow Amplify to access the **Travora** repository.
3. Pick repository **Ddharsh1707/Travora** and branch **main**. Click **Next**.

## Step 3. Build settings

1. App name: `travora`.
2. Amplify finds `amplify.yml` by itself. Leave the build commands as they are.
3. Open **Advanced settings** and add these **Environment variables**:

   | Key | Value |
   | --- | --- |
   | `VITE_AUTH_PROVIDER` | `supabase` |
   | `VITE_SUPABASE_URL` | your Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon public key |

   Type the values with no quotes and no spaces. The URL must start with
   `https://` and end with `.supabase.co`.

4. Click **Next**, then **Save and deploy**.

> **Changed a variable later?** The values are baked into the site when it is
> built, so saving them is not enough. Go to the **main** branch page and click
> **Redeploy this version**, then wait for the new build to finish.

## Step 4. Wait for the first build

The build takes about 3 to 5 minutes. When all steps are green you get a link
like `https://main.d1abc2xyz.amplifyapp.com`. Copy it, you need it below.

If the build fails, open the failed step, copy the log, and send it over.

## Step 5. Add the routing rules

Without this, refreshing any page other than the home page shows a 404.

1. In the left menu open **Hosting → Rewrites and redirects**.
2. Click **Manage redirects**, then **Open text editor**.
3. Delete what is there and paste the whole contents of
   `deploy/aws/amplify-rewrites.json` from the repo.
4. Click **Save**.

## Step 6. Tell Supabase about the new address

1. Supabase dashboard → **Authentication → URL Configuration**:
   - **Site URL**: your Amplify link.
   - **Redirect URLs**: add your Amplify link followed by `/**`.
2. Supabase dashboard → **Edge Functions → Secrets** (or `supabase secrets set`):
   - `ALLOWED_ORIGINS` = your Amplify link (add the Vercel link too, comma
     separated, while both are running).
   - `INVITE_REDIRECT_URL` = your Amplify link + `/login`.

## Step 7. Check it works

1. Open the Amplify link and log in.
2. Go to another page and press refresh. It should stay on that page.
3. Try one upload (scanner or import) and the AI assistant.

## Step 8 (optional). Use your own domain

**Hosting → Custom domains → Add domain**, then follow the screens. If the
domain is on Route 53 it is set up for you; otherwise Amplify shows DNS records
to add at your domain provider. Afterwards, repeat step 6 with the new domain.

## Step 9. Switch off Vercel

Once the AWS site works, remove the project in Vercel (or just leave it
unused). From now on every push to `main` deploys to AWS automatically.

---

## About the old Spring Boot backend

With `VITE_AUTH_PROVIDER=supabase` the site talks to Supabase directly and does
not need the Spring Boot server. The old server at `https://trapple.onrender.com`
no longer answers, so the `/api` rule that forwarded to it has been removed from
`deploy/aws/amplify-rewrites.json`, and its address has been removed from the
security headers in `customHttp.yml`.

If your Amplify app still has an `/api/<*>` rule under **Hosting → Rewrites and
redirects**, delete it: the rules in the console are not updated from the repo.
See "Retiring the legacy Spring Boot backend" in `docs/SECURITY.md` for the
remaining clean-up.
