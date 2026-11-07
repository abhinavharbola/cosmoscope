import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { injectProxy } from "../tools/inject-proxy.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("the CSP hash matches the inline import map", () => {
  const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
  const hash = createHash("sha256").update(map).digest("base64");
  assert.ok(html.includes(`'sha256-${hash}'`), "import map changed, update the CSP hash in index.html");
});

test("index.html has no other inline script", () => {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].map((m) => m[1].trim());
  assert.deepEqual(inline, ['type="importmap"']);
});

test("proxy injection escapes the url, extends the CSP and rejects non-https", () => {
  const out = injectProxy(html, "https://p.example/path?a=1&b=2|x/");
  assert.ok(out.includes('content="https://p.example/path?a=1&amp;b=2|x"'));
  assert.ok(/connect-src [^;]*https:\/\/p\.example/.test(out));
  assert.throws(() => injectProxy(html, "http://p.example"));
  assert.throws(() => injectProxy("<html></html>", "https://p.example"));
});
