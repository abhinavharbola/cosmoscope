import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;

export async function resolve(specifier, context, next) {
  if (imports[specifier]) return { url: new URL(imports[specifier], root).href, shortCircuit: true };
  const prefix = Object.keys(imports).find((k) => k.endsWith("/") && specifier.startsWith(k));
  if (prefix) return { url: new URL(imports[prefix] + specifier.slice(prefix.length), root).href, shortCircuit: true };
  return next(specifier, context);
}
