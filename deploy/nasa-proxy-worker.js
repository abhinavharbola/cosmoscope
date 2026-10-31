const ALLOWED = ["/planetary/apod", "/neo/rest/v1/feed", "/DONKI/FLR"];

export function handle(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  const cors = { "access-control-allow-origin": env.ALLOW_ORIGIN || "*" };
  if (request.method !== "GET" || !ALLOWED.includes(url.pathname)) {
    return Promise.resolve(new Response("Not found", { status: 404, headers: cors }));
  }
  const target = new URL(`https://api.nasa.gov${url.pathname}`);
  for (const [k, v] of url.searchParams) if (k !== "api_key") target.searchParams.set(k, v);
  target.searchParams.set("api_key", env.NASA_API_KEY);
  return fetchImpl(target).then((res) => {
    const headers = new Headers(cors);
    headers.set("content-type", res.headers.get("content-type") || "application/json");
    headers.set("cache-control", "public, max-age=3600");
    return new Response(res.body, { status: res.status, headers });
  });
}

export default { fetch: (request, env) => handle(request, env) };
