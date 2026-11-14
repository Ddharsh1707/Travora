import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { escapeHtml, isSafeAttachment } from "../lib/safeHtml.ts";

const root = path.resolve(import.meta.dirname, "../../..");

describe("Escaping record values for printable HTML", () => {
  test("markup in names is shown as text", () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    assert.equal(escapeHtml("O'Brien & Co"), "O&#39;Brien &amp; Co");
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(42), "42");
  });
});

describe("Attachment previews", () => {
  test("only base64 PDF and image data URLs are opened", () => {
    assert.ok(isSafeAttachment("data:application/pdf;base64,JVBERi0xLjQK"));
    assert.ok(isSafeAttachment("data:image/png;base64,iVBORw0KGgo="));
    assert.equal(isSafeAttachment('data:application/pdf;base64,JVBE" onload="alert(1)'), false);
    assert.equal(isSafeAttachment("data:text/html;base64,PHNjcmlwdD4="), false);
    assert.equal(isSafeAttachment("javascript:alert(1)"), false);
    assert.equal(isSafeAttachment("https://evil.example/x.pdf"), false);
    assert.equal(isSafeAttachment(undefined), false);
  });
  test("no legacy screen writes HTML strings into new windows", () => {
    for (const f of ["client/src/App.tsx", "client/src/components/ReportExtractionSuite.tsx"]) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      assert.ok(!/document\.write\(`<iframe/.test(src), f);
      assert.ok(!/<script>/.test(src), `${f} has an inline script`);
    }
  });
});

describe("Deployed security headers (vercel.json)", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const headers: Record<string, string> = Object.fromEntries(cfg.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));
  const csp = headers["Content-Security-Policy"];
  const directive = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) ?? "";

  test("scripts only from the app itself", () => {
    assert.equal(directive("script-src"), "script-src 'self'");
  });
  test("no wildcard network access", () => {
    assert.ok(!/(^|\s)(https?:|\*)(\s|$)/.test(directive("connect-src")), directive("connect-src"));
    assert.ok(!/(^|\s)https:(\s|$)/.test(directive("img-src")), directive("img-src"));
    assert.ok(!/onrender\.com/.test(directive("connect-src")), "the retired Render backend is not allowed");
    assert.ok(!JSON.stringify(cfg.rewrites ?? []).includes("onrender.com"), "no rewrite proxies to the retired Render backend");
  });
  test("framing, plugins and base tags are blocked", () => {
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.match(headers["Strict-Transport-Security"], /max-age=\d{8,}/);
  });
  test("the page has no inline scripts for the CSP to block", () => {
    const html = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
    assert.ok(!/<script>(?!<\/script>)/.test(html.replace(/<script[^>]*src=[^>]*><\/script>/g, "")));
  });
});

describe("Development tools stay out of production builds", () => {
  const cfg = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
  test("editor runtime, log collector, source locations and storage proxy are dev-only", () => {
    for (const p of ["jsxLocPlugin()", "vitePluginManusRuntime()", "vitePluginManusDebugCollector()", "vitePluginStorageProxy()"]) {
      const line = cfg.split("\n").find((l) => l.includes(p) && !l.trim().startsWith("function"));
      assert.ok(line && line.includes("devOnly("), `${p} must be wrapped in devOnly()`);
    }
  });
  test("no secret-looking VITE_ variables are read by the browser bundle", () => {
    const files = fs.readdirSync(path.join(root, "client/src/lib")).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, "client/src/lib", f), "utf8");
      assert.ok(!/VITE_[A-Z_]*(SERVICE_ROLE|SECRET|ANTHROPIC|PRIVATE)/.test(src), f);
    }
  });
});
