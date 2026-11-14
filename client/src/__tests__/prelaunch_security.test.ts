// Pre-launch security checks (2026-11-14). Each test is one way an attacker
// could get in, checked on the code itself so it cannot quietly come back.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assistantRehypePlugins } from "../lib/markdownSafety.ts";
import { sanitizeCsvCell } from "../utils/exportCsv.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

describe("AI answers cannot run HTML or leak data through pictures", () => {
  const harden = (o: unknown) => o;
  const katex = () => undefined;
  const raw = () => undefined;
  const plugins = assistantRehypePlugins({
    harden: [harden, { allowedImagePrefixes: ["*"], allowedLinkPrefixes: ["*"], allowDataImages: true }],
    raw,
    katex: [katex, {}],
  } as never);

  test("raw HTML in an answer is never turned into live HTML", () => {
    assert.ok(!plugins.includes(raw as never));
    assert.equal(plugins.length, 2);
  });
  test("no image is loaded from an answer (an image URL can carry data to another site)", () => {
    const [fn, opts] = plugins[0] as [unknown, Record<string, unknown>];
    assert.equal(fn, harden);
    assert.deepEqual(opts.allowedImagePrefixes, []);
    assert.equal(opts.allowDataImages, false);
    assert.ok(typeof opts.defaultOrigin === "string" && opts.defaultOrigin.length > 0);
  });
  test("both answer screens use the safe renderer", () => {
    const md = read("client/src/components/Markdown.tsx");
    assert.match(md, /assistantRehypePlugins\(/);
    assert.match(md, /rehypePlugins=\{plugins\}/);
    for (const f of ["client/src/components/TrappleAIFloatingChat.tsx", "client/src/pages/AIAssistant.tsx"]) {
      assert.ok(!/from "streamdown"/.test(read(f)), `${f} must render answers through components/Markdown`);
    }
  });
  test("a renderer upgrade that drops the link/image filter is caught", () => {
    assert.throws(() => assistantRehypePlugins({ raw } as never), /link\/image filter/);
  });
});

describe("Edge Functions check who is calling", () => {
  const fns = fs.readdirSync(path.join(root, "supabase/functions")).filter((d) => !d.startsWith("_") && fs.existsSync(path.join(root, "supabase/functions", d, "index.ts")));
  test("found the functions", () => assert.ok(fns.length >= 3, fns.join(",")));
  for (const fn of fns) {
    const src = read(`supabase/functions/${fn}/index.ts`);
    test(`${fn}: verifies the user's token before doing anything`, () => {
      // The Supabase gateway check is off (verify_jwt = false), so each function must do it.
      const getCaller = src.indexOf("await getCaller(req)");
      assert.ok(getCaller > 0, "calls getCaller");
      assert.match(src, /if \(!caller\) return fail\(req, 401/);
      for (const risky of ["req.json()", "adminClient()", "fetch("]) {
        const at = src.indexOf(risky, src.indexOf("Deno.serve"));
        if (at >= 0) assert.ok(at > getCaller, `${risky} must come after the sign-in check`);
      }
    });
    test(`${fn}: answers OPTIONS and refuses other methods`, () => {
      assert.match(src, /req\.method === "OPTIONS"/);
      assert.match(src, /req\.method !== "POST"\) return fail\(req, 405/);
    });
  }
  test("staff-only functions check the role on the server", () => {
    assert.match(read("supabase/functions/admin-users/index.ts"), /caller\.role !== "admin" && caller\.role !== "company_admin"\) return fail\(req, 403/);
    assert.match(read("supabase/functions/document-extract/index.ts"), /caller\.role !== "travel_desk" && caller\.role !== "company_admin" && caller\.role !== "admin"\) return fail\(req, 403/);
  });
  test("getCaller asks Supabase Auth to verify the token and never trusts a role from the browser", () => {
    const auth = read("supabase/functions/_shared/auth.ts");
    assert.match(auth, /auth\.getUser\(\)/);
    assert.match(auth, /rpc\("get_my_profile"\)/);
    assert.ok(!/body\.role|headers\.get\("x-role/i.test(auth));
  });
  test("CORS only echoes listed websites, never *", () => {
    const http = read("supabase/functions/_shared/http.ts");
    assert.match(http, /allowedOrigins\.includes\(origin\)/);
    assert.ok(!/Allow-Origin"\s*:\s*"\*"/.test(http));
    const deploy = read(".github/workflows/deploy-functions.yml");
    assert.ok(!/ALLOWED_ORIGINS: .*localhost/.test(deploy), "localhost is not allowed on the live project by default");
  });
  test("every function keeps verify_jwt = false only together with the in-code check above", () => {
    const cfg = read("supabase/config.toml");
    for (const fn of fns) assert.match(cfg, new RegExp(`\\[functions\\.${fn}\\]\\s*\\nverify_jwt = (true|false)`), fn);
  });
});

describe("No secrets in the code or in the browser bundle settings", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean)
    .filter((f) => !/\.(png|jpe?g|webp|gif|ico|pdf|xlsx|zip|bundle|woff2?|ttf|lock|ya?ml\.lock)$/i.test(f) && f !== "pnpm-lock.yaml");
  const patterns: [string, RegExp][] = [
    ["Groq key", /gsk_[A-Za-z0-9]{20,}/],
    ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
    ["Google key", /AIza[0-9A-Za-z_-]{30,}/],
    ["Supabase access token", /sbp_[a-f0-9]{30,}/],
    ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
    ["GitHub token", /gh[pous]_[A-Za-z0-9]{30,}/],
    ["AWS key", /AKIA[0-9A-Z]{16}/],
    ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["real JWT", /eyJhbGciOi[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ];
  test("no tracked file contains a key or token", () => {
    const hits: string[] = [];
    for (const f of tracked) {
      let text: string;
      try { text = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
      for (const [name, re] of patterns) if (re.test(text)) hits.push(`${f}: ${name}`);
    }
    assert.deepEqual(hits, []);
  });
  test("no .env file with values is committed", () => {
    assert.deepEqual(tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example")), []);
  });
  test("the browser only ever gets public VITE_ settings, never a service key", () => {
    const vars = new Set<string>();
    for (const f of tracked.filter((x) => x.startsWith("client/src/") && !x.includes("__tests__") && /\.(ts|tsx)$/.test(x))) {
      for (const m of read(f).matchAll(/VITE_[A-Z0-9_]+/g)) vars.add(m[0]);
    }
    for (const v of vars) assert.ok(!/SERVICE|SECRET|PRIVATE|GROQ|GEMINI|ANTHROPIC|OPENAI/.test(v), `${v} must not be sent to browsers`);
  });
});

describe("Website security headers", () => {
  const amplify = read("customHttp.yml");
  test("strict Content Security Policy: no inline or remote scripts, no framing", () => {
    const csp = amplify.match(/Content-Security-Policy\s*\n\s*value: "([^"]+)"/)?.[1] ?? "";
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.ok(!/unsafe-eval/.test(csp));
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /img-src 'self' data: blob: https:\/\/\*\.supabase\.co;/, "pictures only from the site and Supabase");
  });
  test("the retired Render backend is no longer allowed or proxied", () => {
    const csp = amplify.match(/Content-Security-Policy\s*\n\s*value: "([^"]+)"/)?.[1] ?? "";
    assert.ok(!/onrender\.com/.test(csp), "customHttp.yml connect-src must not allow onrender.com");
    assert.ok(!/onrender\.com/.test(read("deploy/aws/amplify-rewrites.json")), "Amplify rules must not proxy to onrender.com");
  });
  test("HSTS, nosniff, no framing and a referrer policy are sent", () => {
    for (const h of ["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
      assert.ok(amplify.includes(h), h);
    }
  });
});

describe("Downloads and password links", () => {
  test("CSV cells that look like spreadsheet formulas are neutralised", () => {
    assert.equal(sanitizeCsvCell("=HYPERLINK(\"https://evil.example\")"), "\"'=HYPERLINK(\"\"https://evil.example\"\")\"");
    assert.match(read("client/src/components/ReportExtractionSuite.tsx"), /const escapeCSV = sanitizeCsvCell;/);
  });
  test("a password-reset link opens the set-a-new-password screen", () => {
    const auth = read("client/src/lib/supabaseAuth.ts");
    assert.match(auth, /\/login\?reset=1/);
    assert.match(auth, /auth\.updateUser\(\{ password \}\)/);
    assert.match(read("client/src/App.tsx"), /<SetNewPassword \/>/);
  });
});
