# Letting people create their own account

The login page now has a **Create account** tab. This guide is the one-time
Supabase setup that makes it work. It takes about 5 minutes.

## How it works

1. Someone fills in name, work email and password on the login page.
2. Supabase emails them a confirmation link.
3. When they click it, the database gives them an account with the
   **employee** role (the lowest one). Nobody can sign up as an admin,
   approver or travel desk user. An admin can promote them later.
4. If an admin had already added that email as an employee, the new login is
   linked to that existing record instead (and keeps its role).

## One-time setup in the Supabase dashboard

Open your project at https://supabase.com/dashboard.

**Step 1. Add the new database rules**
- Left menu: **SQL Editor** → **New query**.
- Open `supabase/migrations/20261106000600_self_signup.sql` from this repo,
  copy everything, paste it in, press **Run**. You should see "Success".

**Step 2. Turn on sign-ups**
- Left menu: **Authentication** → **Sign In / Providers**.
- Switch **Allow new users to sign up** to ON.
- Click **Email** in the provider list and make sure **Confirm email** is ON.
  Leave it ON: accounts are only created after the email is confirmed.
- Press **Save**.

**Step 3. Tell Supabase your website address**
- Left menu: **Authentication** → **URL Configuration**.
- **Site URL**: `https://main.d27refhdsen811.amplifyapp.com`
- Under **Redirect URLs** press **Add URL** and add
  `https://main.d27refhdsen811.amplifyapp.com/**`
- Press **Save**.

**Step 4. Send emails reliably (recommended)**
Supabase's built-in email sender only sends a few emails per hour, which is
fine for testing but not for a team.
- Left menu: **Authentication** → **Emails** → **SMTP Settings**.
- Switch on **Enable custom SMTP** and fill in the details from your email
  provider (for example Gmail/Google Workspace, Zoho, Amazon SES, Resend).

## Optional: only allow your company's email addresses

Run this in **SQL Editor** (change the domain to yours):

```sql
insert into private.signup_allowed_domains (domain) values ('mahathiinfra.com');
```

People with other email addresses can still confirm their email, but they get
no access. To allow any address again: `delete from private.signup_allowed_domains;`

## Giving someone more access

Sign in as an admin and change their role from the users screen, or run in
**SQL Editor**:

```sql
update public.profiles set role = 'approver' where email = 'person@company.com';
```

Roles: `employee`, `approver`, `travel_desk`, `admin`.
