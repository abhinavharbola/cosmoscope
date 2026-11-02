const STUB = new URL("./world-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "./world.js") return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
