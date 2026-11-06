-- Run ONCE in the Supabase Dashboard > SQL Editor to create the first administrator.
-- 1. Replace the three values below (no passwords are involved).
-- 2. Run this script.
-- 3. Dashboard > Authentication > Users > "Invite user" with the SAME email.
--    When the invite is accepted, the login is linked to this profile
--    automatically and the person can sign in as an administrator.
insert into public.profiles (employee_id, full_name, email, role)
values ('REPLACE_EMPLOYEE_ID', 'REPLACE FULL NAME', 'replace.me@yourcompany.com', 'admin');
