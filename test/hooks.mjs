const STUB = new URL("./stubs/three.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "three") return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
