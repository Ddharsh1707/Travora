import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { AUTH_PROVIDER, __test__, isSupabaseEnabled } from "../lib/supabase.ts";
import { passwordProblems, passwordStrength, profileToAuthUser, validateSignUp } from "../lib/supabaseAuth.ts";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

test("Supabase browser client safety", async (t) => {
  await t.test("uses Supabase when VITE_AUTH_PROVIDER is not set, never the retired backend", () => {
    assert.strictEqual(AUTH_PROVIDER, "supabase");
    assert.strictEqual(isSupabaseEnabled, true);
    const src = fs.readFileSync(path.resolve(process.cwd(), "client/src/lib/supabase.ts"), "utf-8");
    assert.match(src, /VITE_AUTH_PROVIDER === "legacy" \? "legacy" : "supabase"/, "legacy mode must be asked for by name");
  });

  await t.test("refuses service-role / secret keys", () => {
    assert.strictEqual(__test__.looksLikeServiceRoleKey(`${b64({ alg: "HS256" })}.${b64({ role: "service_role" })}.sig`), true);
    assert.strictEqual(__test__.looksLikeServiceRoleKey("sb_secret_abc123"), true);
  });

  await t.test("accepts anon / publishable keys", () => {
    assert.strictEqual(__test__.looksLikeServiceRoleKey(`${b64({ alg: "HS256" })}.${b64({ role: "anon" })}.sig`), false);
    assert.strictEqual(__test__.looksLikeServiceRoleKey("sb_publishable_abc123"), false);
  });

  await t.test("no privileged secret is referenced from frontend code", () => {
    const root = path.resolve(process.cwd(), "client/src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== "__tests__") walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const src = fs.readFileSync(full, "utf-8");
        if (/VITE_[A-Z_]*(SERVICE_ROLE|SECRET|ANTHROPIC|OPENAI|DB_PASSWORD)/.test(src)) offenders.push(full);
        if (/SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY/.test(src)) offenders.push(full);
      }
    };
    walk(root);
    assert.deepStrictEqual(offenders, []);
  });
});

test("profile to UI user mapping", async (t) => {
  const base = { id: "00000000-0000-0000-0000-0000000000e1", employee_id: "EMP001", full_name: "Arun Kumar", email: "arun@example.com", department: "Engineering", designation: null, manager_id: null };

  await t.test("maps database roles to UI roles", () => {
    assert.strictEqual(profileToAuthUser({ ...base, role: "travel_desk" }).role, "TRAVEL_DESK");
    assert.strictEqual(profileToAuthUser({ ...base, role: "employee" }).role, "EMPLOYEE");
  });

  await t.test("rejects unknown roles instead of guessing", () => {
    assert.throws(() => profileToAuthUser({ ...base, role: "superuser" }));
  });

  await t.test("produces a valid numeric id for legacy screens", () => {
    const u = profileToAuthUser({ ...base, role: "admin" });
    assert.ok(Number.isFinite(u.id) && u.id > 0);
    assert.strictEqual(u.profileId, base.id);
  });
});

test("self sign-up form checks", async (t) => {
  const ok = { fullName: "Arun Kumar", email: "arun@company.com", password: "Travel2026Desk", confirmPassword: "Travel2026Desk" };

  await t.test("accepts a valid sign-up", () => {
    assert.strictEqual(validateSignUp(ok), null);
  });

  await t.test("password rules match the Supabase settings", () => {
    assert.deepStrictEqual(passwordProblems("Travel2026Desk"), []);
    assert.ok(passwordProblems("short1A").includes("at least 12 characters"));
    assert.ok(passwordProblems("alllowercase1234").includes("an upper-case letter"));
    assert.ok(validateSignUp({ ...ok, password: "nouppercase123", confirmPassword: "nouppercase123" }));
  });

  await t.test("rejects mismatched passwords, bad emails and empty names", () => {
    assert.match(validateSignUp({ ...ok, confirmPassword: "Different2026X" }) ?? "", /do not match/);
    assert.match(validateSignUp({ ...ok, email: "not-an-email" }) ?? "", /email/);
    assert.match(validateSignUp({ ...ok, fullName: " " }) ?? "", /name/);
  });

  await t.test("a password that breaks the rules never shows as Good or Strong", () => {
    assert.ok(passwordStrength("Travel2026x") <= 2);
    assert.ok(passwordStrength("Travel2026Desk") >= 3);
  });

  await t.test("the sign-up request never sends a role", () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "client/src/lib/supabaseAuth.ts"), "utf-8");
    const block = src.slice(src.indexOf("auth.signUp("), src.indexOf("auth.signUp(") + 400);
    assert.ok(!/role/i.test(block));
  });
});

test("Supabase URL is cleaned up from common paste mistakes", () => {
  const n = __test__.normalizeSupabaseUrl;
  const want = "https://abcd1234.supabase.co";
  assert.strictEqual(n("https://abcd1234.supabase.co"), want);
  assert.strictEqual(n("  abcd1234.supabase.co  "), want);
  assert.strictEqual(n('"https://abcd1234.supabase.co/"'), want);
  assert.strictEqual(n("https://abcd1234.supabase.co/rest/v1/"), want);
  assert.strictEqual(n(""), "");
  assert.strictEqual(n(undefined), "");
  assert.strictEqual(n("not a url at all"), "");
});

test("the browser uses the real Supabase library, not a stand-in", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "client/src/lib/supabase.ts"), "utf-8");
  assert.match(src, /import \{ createClient[^}]*\} from "@supabase\/supabase-js"/);
  assert.ok(!/const createClient\s*=/.test(src), "createClient must not be replaced by a local stub");
});
