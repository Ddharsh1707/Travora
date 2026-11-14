#!/usr/bin/env node
// Live security check of the PUBLIC website, done the way an outsider would:
// no password, no keys, only what any visitor's browser downloads.
//
// It only READS. It never signs up, logs in, sends emails, uploads, or changes
// anything, and it makes a few dozen requests in total (not a load test).
//
//   node scripts/security/live-check.mjs [https://site.example]
//
// Exit code 1 when a check FAILS, so the GitHub workflow turns red.
import fs from "node:fs";
import path from "node:path";

const SITE = (process.argv[2] || process.env.LIVE_SITE_URL || "https://main.d27refhdsen811.amplifyapp.com").replace(/\/+$/, "");
const EVIL_ORIGIN = "https://attacker.example";
const ROOT = path.resolve(import.meta.dirname, "../..");
const results = [];
const add = (level, area, check, detail = "") => results.push({ level, area, check, detail });
const pass = (a, c, d) => add("PASS", a, c, d);
const fail = (a, c, d) => add("FAIL", a, c, d);
const warn = (a, c, d) => add("WARN", a, c, d);

async function get(url, init = {}) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), ...init });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text };
  } catch (err) {
    return { status: 0, headers: new Headers(), text: String(err?.message ?? err) };
  }
}

function jwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** Table and view names from the migrations, so new tables are probed automatically. */
function knownRelations() {
  const dir = path.join(ROOT, "supabase/migrations");
  const names = new Set();
  for (const f of fs.readdirSync(dir)) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) names.add(m[1]);
  }
  return [...names].sort();
}
function knownBuckets() {
  const dir = path.join(ROOT, "supabase/migrations");
  const sql = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  return [...new Set([...sql.matchAll(/bucket_id\s*=\s*'([a-z0-9-]+)'/g)].map((m) => m[1]))];
}
const FUNCTIONS = fs.readdirSync(path.join(ROOT, "supabase/functions")).filter((d) => !d.startsWith("_") && fs.existsSync(path.join(ROOT, "supabase/functions", d, "index.ts")));

// ---------------------------------------------------------------------------
// 1. The website: HTTPS, headers, and what the JavaScript gives away
// ---------------------------------------------------------------------------
const home = await get(`${SITE}/`);
if (home.status !== 200) {
  fail("Website", `Home page loads (${SITE})`, `HTTP ${home.status} ${home.text.slice(0, 120)}`);
} else {
  pass("Website", "Home page loads", SITE);
}
const insecure = await get(SITE.replace(/^https:/, "http:") + "/");
if (insecure.status >= 300 && insecure.status < 400 && /^https:/.test(insecure.headers.get("location") ?? "")) pass("Website", "Plain http:// redirects to https://");
else if (insecure.status === 0) pass("Website", "Plain http:// is not served");
else warn("Website", "Plain http:// redirects to https://", `HTTP ${insecure.status}`);

const h = home.headers;
const csp = h.get("content-security-policy") ?? "";
if (!csp) fail("Headers", "Content-Security-Policy is sent", "missing: the browser would run injected scripts and load any image");
else {
  const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? "";
  if (/unsafe-inline|unsafe-eval|\*/.test(scriptSrc)) fail("Headers", "CSP blocks inline and remote scripts", `script-src${scriptSrc}`);
  else pass("Headers", "CSP blocks inline and remote scripts", `script-src${scriptSrc}`);
  if (/frame-ancestors\s+'none'/.test(csp)) pass("Headers", "CSP stops other sites framing the app (clickjacking)");
  else fail("Headers", "CSP stops other sites framing the app (clickjacking)", "frame-ancestors 'none' missing");
}
const hsts = h.get("strict-transport-security") ?? "";
if (/max-age=(\d+)/.test(hsts) && Number(hsts.match(/max-age=(\d+)/)[1]) >= 15552000) pass("Headers", "HSTS (always HTTPS)", hsts);
else fail("Headers", "HSTS (always HTTPS)", hsts || "missing");
for (const [name, want] of [["x-content-type-options", /nosniff/i], ["x-frame-options", /deny|sameorigin/i], ["referrer-policy", /./]]) {
  const v = h.get(name);
  if (v && want.test(v)) pass("Headers", name, v);
  else fail("Headers", name, v ?? "missing");
}
if (h.get("x-powered-by")) warn("Headers", "Server does not advertise its software", `x-powered-by: ${h.get("x-powered-by")}`);

// JavaScript bundle
const scripts = [...home.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], `${SITE}/`).href);
const preloads = [...home.text.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => new URL(m[1], `${SITE}/`).href);
let bundle = "";
for (const src of [...new Set([...scripts, ...preloads])].slice(0, 20)) {
  const r = await get(src);
  if (r.status === 200) bundle += `\n${r.text}`;
}
// Lazy chunks named in the main bundle (only a handful, to stay polite).
for (const m of [...bundle.matchAll(/["'`](\/?assets\/[A-Za-z0-9_.-]+\.js)["'`]/g)].slice(0, 60)) {
  const r = await get(new URL(m[1], `${SITE}/`).href);
  if (r.status === 200) bundle += `\n${r.text}`;
}
if (!bundle) fail("Bundle", "Downloaded the site's JavaScript", "no scripts found");
else pass("Bundle", "Downloaded the site's JavaScript", `${Math.round(bundle.length / 1024)} KB`);

const secretPatterns = [
  ["Groq key", /gsk_[A-Za-z0-9]{20,}/],
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["Google/Gemini key", /AIza[0-9A-Za-z_-]{30,}/],
  ["OpenAI key", /sk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["Supabase access token", /sbp_[a-f0-9]{30,}/],
  ["GitHub token", /gh[pous]_[A-Za-z0-9]{30,}/],
  ["AWS key", /AKIA[0-9A-Z]{16}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const leaked = secretPatterns.filter(([, re]) => re.test(bundle)).map(([n]) => n);
const jwts = [...new Set(bundle.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? [])];
let anonKey = null;
for (const t of jwts) {
  const p = jwtPayload(t);
  if (p?.role === "service_role") leaked.push("Supabase SERVICE ROLE key (full database access)");
  if (p?.role === "anon") anonKey = t;
}
anonKey ??= bundle.match(/sb_publishable_[A-Za-z0-9_-]{10,}/)?.[0] ?? null;
if (leaked.length) fail("Bundle", "No secret keys in the website's JavaScript", leaked.join(", "));
else pass("Bundle", "No secret keys in the website's JavaScript", `${jwts.length} token(s) checked`);

const supabaseUrl = process.env.LIVE_SUPABASE_URL || (bundle.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0] ?? null);
if (!supabaseUrl || !anonKey) {
  fail("Bundle", "Found the public Supabase address and anon key", "cannot run the database checks without them");
} else {
  pass("Bundle", "Found the public Supabase address and anon key (these are meant to be public)", supabaseUrl);
}

// ---------------------------------------------------------------------------
// 2. Database, files, sign-up and server functions, as a logged-out outsider
// ---------------------------------------------------------------------------
if (supabaseUrl && anonKey) {
  const anon = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

  // Every table and view, straight through the REST API.
  const relations = knownRelations();
  const open = [];
  for (const rel of relations) {
    const r = await get(`${supabaseUrl}/rest/v1/${rel}?select=*&limit=1`, { headers: anon });
    let rows = null;
    try { rows = JSON.parse(r.text); } catch { /* not JSON */ }
    if (r.status === 200 && Array.isArray(rows) && rows.length > 0) open.push(`${rel} (returned data)`);
    else if (r.status === 200) open.push(`${rel} (readable, empty now)`);
  }
  if (open.length) fail("Database", `Logged-out visitors cannot read any of ${relations.length} tables/views`, open.join(", "));
  else pass("Database", `Logged-out visitors cannot read any of ${relations.length} tables/views`);

  // What the API advertises to an outsider.
  const spec = await get(`${supabaseUrl}/rest/v1/`, { headers: { ...anon, Accept: "application/openapi+json" } });
  try {
    const paths = Object.keys(JSON.parse(spec.text).paths ?? {}).filter((p) => p !== "/");
    if (paths.length) warn("Database", "API does not list tables or functions to outsiders", `${paths.length} listed, e.g. ${paths.slice(0, 6).join(" ")}`);
    else pass("Database", "API does not list tables or functions to outsiders");
  } catch {
    pass("Database", "API does not list tables or functions to outsiders", `HTTP ${spec.status}`);
  }

  // Stored files.
  const buckets = await get(`${supabaseUrl}/storage/v1/bucket`, { headers: anon });
  try {
    const list = JSON.parse(buckets.text);
    if (Array.isArray(list) && list.length) fail("Files", "Logged-out visitors cannot list storage buckets", list.map((b) => b.name).join(", "));
    else pass("Files", "Logged-out visitors cannot list storage buckets");
  } catch {
    pass("Files", "Logged-out visitors cannot list storage buckets", `HTTP ${buckets.status}`);
  }
  for (const b of knownBuckets()) {
    const list = await get(`${supabaseUrl}/storage/v1/object/list/${b}`, {
      method: "POST", headers: { ...anon, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "", limit: 5 }),
    });
    let items = null;
    try { items = JSON.parse(list.text); } catch { /* ignore */ }
    if (Array.isArray(items) && items.length) fail("Files", `Bucket ${b}: logged-out visitors cannot list files`, `${items.length}+ files visible`);
    else pass("Files", `Bucket ${b}: logged-out visitors cannot list files`);
    const pub = await get(`${supabaseUrl}/storage/v1/object/public/${b}/probe-does-not-exist.pdf`);
    if (/not found|bucket/i.test(pub.text) && pub.status !== 200) pass("Files", `Bucket ${b} is private (no public links)`);
    else if (pub.status === 200) fail("Files", `Bucket ${b} is private (no public links)`, "public URL served a file");
    else pass("Files", `Bucket ${b} is private (no public links)`, `HTTP ${pub.status}`);
  }

  // Sign-up and email confirmation settings (public endpoint, read only).
  const settings = await get(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: anonKey } });
  try {
    const s = JSON.parse(settings.text);
    if (s.disable_signup) pass("Sign-in", "Strangers cannot create accounts (sign-ups off)");
    else fail("Sign-in", "Strangers cannot create accounts (sign-ups off)",
      "Sign-ups are ON: anyone with the public key can create an account through the API, even though the page hides the form. Supabase > Authentication > Sign In / Providers > turn off 'Allow new users to sign up'.");
    if (s.mailer_autoconfirm) fail("Sign-in", "New emails must be confirmed",
      "Confirm email is OFF: someone could sign up with an employee's address and be linked to that employee's profile. Turn 'Confirm email' ON.");
    else pass("Sign-in", "New emails must be confirmed");
    const providers = Object.entries(s.external ?? {}).filter(([k, v]) => v === true && k !== "email").map(([k]) => k);
    if (providers.length) warn("Sign-in", "Only email sign-in is switched on", `also on: ${providers.join(", ")}`);
    else pass("Sign-in", "Only email sign-in is switched on");
  } catch {
    warn("Sign-in", "Read the public sign-in settings", `HTTP ${settings.status}`);
  }

  // Server functions: no token, the public key as a token, and a hostile website.
  for (const fn of FUNCTIONS) {
    const url = `${supabaseUrl}/functions/v1/${fn}`;
    const none = await get(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (none.status === 401 || none.status === 403) pass("Functions", `${fn}: refuses a request with no sign-in`, `HTTP ${none.status}`);
    else fail("Functions", `${fn}: refuses a request with no sign-in`, `HTTP ${none.status} ${none.text.slice(0, 100)}`);
    const pub = await get(url, { method: "POST", headers: { ...anon, "Content-Type": "application/json" }, body: "{}" });
    if (pub.status === 401 || pub.status === 403) pass("Functions", `${fn}: refuses the public key pretending to be a user`, `HTTP ${pub.status}`);
    else fail("Functions", `${fn}: refuses the public key pretending to be a user`, `HTTP ${pub.status} ${pub.text.slice(0, 100)}`);
    const forged = await get(url, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${forgeToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (forged.status === 401 || forged.status === 403) pass("Functions", `${fn}: refuses a forged Director token`, `HTTP ${forged.status}`);
    else fail("Functions", `${fn}: refuses a forged Director token`, `HTTP ${forged.status} ${forged.text.slice(0, 100)}`);
    const evil = await get(url, {
      method: "OPTIONS",
      headers: { Origin: EVIL_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
    });
    const acao = evil.headers.get("access-control-allow-origin");
    if (acao === "*" || acao === EVIL_ORIGIN) fail("Functions", `${fn}: other websites cannot call it from a visitor's browser (CORS)`, `allowed ${acao}`);
    else pass("Functions", `${fn}: other websites cannot call it from a visitor's browser (CORS)`);
    const own = await get(url, { method: "OPTIONS", headers: { Origin: SITE, "Access-Control-Request-Method": "POST" } });
    if (own.headers.get("access-control-allow-origin") !== SITE) warn("Functions", `${fn}: the live site itself is allowed (CORS)`, "the app's own calls would be blocked; check ALLOWED_ORIGINS");
  }
}

/** A token signed with a made-up key, claiming to be a Director. Must be rejected. */
function forgeToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "00000000-0000-0000-0000-000000000001", role: "authenticated", app_role: "admin", aud: "authenticated", iat: now, exp: now + 600 })}.${Buffer.from("forged-signature").toString("base64url")}`;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const order = { FAIL: 0, WARN: 1, PASS: 2 };
results.sort((a, b) => order[a.level] - order[b.level]);
const counts = Object.fromEntries(["FAIL", "WARN", "PASS"].map((l) => [l, results.filter((r) => r.level === l).length]));
const icon = { FAIL: "❌", WARN: "⚠️", PASS: "✅" };
const lines = [
  `## Live security check: ${SITE}`,
  "",
  `${counts.FAIL} failed, ${counts.WARN} warnings, ${counts.PASS} passed. Read-only checks, done as a logged-out outsider.`,
  "",
  "| | Area | Check | Detail |",
  "|---|---|---|---|",
  ...results.map((r) => `| ${icon[r.level]} | ${r.area} | ${r.check} | ${String(r.detail).replace(/\|/g, "\\|").replace(/\n/g, " ")} |`),
];
const md = lines.join("\n");
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
if (process.env.LIVE_CHECK_JSON) fs.writeFileSync(process.env.LIVE_CHECK_JSON, JSON.stringify(results, null, 2));
process.exit(counts.FAIL ? 1 : 0);
