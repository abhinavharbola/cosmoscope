const ROUTES = {
  "/planetary/apod": ["date"],
  "/neo/rest/v1/feed": ["start_date", "end_date"],
  "/DONKI/FLR": ["startDate", "endDate"],
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function allowedOrigins(env) {
  return String(env.ALLOW_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function respond(body, status, extra = {}) {
  return new Response(body, { status, headers: { "cache-control": "no-store", ...extra } });
}

export async function handle(request, env, fetchImpl = fetch) {
  const origins = allowedOrigins(env);
  if (!origins.length || !env.NASA_API_KEY) return respond("Proxy is not configured", 500);

  const origin = request.headers.get("origin");
  if (!origin || !origins.includes(origin)) return respond("Forbidden", 403);

  const cors = {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    vary: "Origin",
  };

  if (request.method === "OPTIONS") return respond(null, 204, cors);

  const url = new URL(request.url);
  const allowed = ROUTES[url.pathname];
  if (request.method !== "GET" || !allowed) return respond("Not found", 404, cors);

  const target = new URL(`https://api.nasa.gov${url.pathname}`);
  for (const [k, v] of url.searchParams) {
    if (!allowed.includes(k)) continue;
    if (!DATE.test(v)) return respond("Bad request", 400, cors);
    target.searchParams.set(k, v);
  }
  target.searchParams.set("api_key", env.NASA_API_KEY);

  let res;
  try {
    res = await fetchImpl(target);
  } catch {
    return respond("Upstream unavailable", 502, cors);
  }
  const headers = new Headers(cors);
  headers.set("content-type", res.headers.get("content-type") || "application/json");
  headers.set("cache-control", res.ok ? "public, max-age=3600" : "no-store");
  return new Response(res.body, { status: res.status, headers });
}

export default { fetch: (request, env) => handle(request, env) };
