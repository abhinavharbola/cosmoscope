import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const META = '<meta name="nasa-proxy" content="">';

export function injectProxy(html, rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("NASA_PROXY_URL must be an https URL");
  const clean = url.href.replace(/\/+$/, "");
  const attr = clean.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (!html.includes(META)) throw new Error("proxy meta tag not found");
  const out = html
    .replace(META, () => `<meta name="nasa-proxy" content="${attr}">`)
    .replace(/(connect-src [^;"]*)/, (m) => `${m} ${url.origin}`);
  if (!out.includes(`content="${attr}"`) || !out.includes(url.origin)) throw new Error("proxy injection failed");
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  const proxy = process.env.NASA_PROXY_URL;
  if (!file || !proxy) {
    console.error("usage: NASA_PROXY_URL=https://... node tools/inject-proxy.mjs <index.html>");
    process.exit(2);
  }
  writeFileSync(file, injectProxy(readFileSync(file, "utf8"), proxy));
}
