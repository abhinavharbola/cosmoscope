# Developing

## Run

No build. Serve the folder over HTTP (ES modules do not load from file://):

    python3 -m http.server 8000

Three.js and astronomy-engine are served from the committed `vendor/` folder, and the fonts from `src/fonts/`, so only the NASA feeds need internet access. After the first `npm install && npm run vendor`, commit `package-lock.json` and `vendor/`. The workflows use `npm ci` when a lockfile exists.

To change a library version, edit `devDependencies`, run `npm install` and `npm run vendor`, and commit `vendor/`. `npm test` fails if `vendor/` differs from the installed packages. The vendor script also copies `three.core.js` when the installed Three.js ships it (r171 and later), so version bumps do not break the app.

## Source layout

| Module | Responsibility |
| --- | --- |
| `main.js` | Starts the world, wires the modules together, runs the frame loop |
| `world.js` | The Three.js scene: bodies, camera, picking, labels, trails, eclipses |
| `sim.js` | Simulation clock state and time scale helpers |
| `hashsync.js`, `hash.js` | URL hash parsing, building and syncing, including the camera view |
| `plate.js` | The info plate for the focused body or mission |
| `nav.js` | The body and mission index |
| `dock.js` | Clock, almanac, transport, presets and view toggles |
| `menus.js`, `dialog.js` | Jump and View menus, modal dialogs with focus trapping |
| `tours.js` | Guided tour definitions and the tour card |
| `hint.js` | First-run hint |
| `keys.js` | Keyboard shortcuts |
| `viewctl.js`, `diag.js`, `pulsectl.js` | View toggles, diagnostics panel, light pulse control |
| `data.js`, `ephemeris.js`, `missions.js`, `textures.js`, `materials.js` | Body facts, positions, mission catalog, surfaces and shaders |

## Tests and diagnostics

`npm install && npm test` runs mission catalog parsing, Hermite interpolation, query building, thinning and size caps, and a full offline bake against an astronomy-engine stand-in for Horizons (`test/missions.test.mjs`), plus data, orientation, clock, formatting, spin blending, pulse timing, eclipse cache, ephemeris, CSP hash and proxy injection checks. Ephemeris checks need `astronomy-engine` and are skipped without it. Press D in the app for frame rate, GPU name, shader fallback state and texture build time. `npm run textures` writes the procedural maps to `out/textures/` for inspection. `npm test` also covers manifest parsing, path safety and tier fallback. `test/world.test.mjs` drives `createWorld` with a headless renderer and a stub canvas to check that every body builds, textures load, positions and rotations stay finite, fast spin does not snap, trails upload only when needed and the light pulse reports each planet once. It also loads a baked fixture mission, checks that it follows the ephemeris, centres the camera and honours the toggles. It needs `vendor/` and does not cover actual rendering.

## UI logic tests

`npm run test:ui` loads `src/main.js` in jsdom against a fake world and drives frames by hand. It covers the mission index, craft plates, the missions toggle and a craft link in the hash. It also covers key handling (Space on buttons, key repeat, the help dialog and its Close button), the About dialog, the guided tours, the first-run hint, the camera view in the hash, the Sun plate text, the live clock across a stalled frame and after a date jump, hash edits including pause and reverse flags, NASA panel retry after a failed load, the almanac rows, and the clock wrap stopping the light pulse. It needs no browser and no WebGL, and it does not cover rendering.

## Browser smoke tests

`npm install && npx playwright install chromium && npm run test:browser` starts a local static server and drives headless Chromium with software WebGL. The run loads the page, waits for the intro to clear and for textures to finish, then checks:

- no console errors, page errors, failed requests or HTTP 4xx and 5xx responses, and no shader or texture warnings
- the diagnostics panel reports no shader fallback
- every body in the index can be focused, shows its plate, is picked by the cursor at the screen center, and renders a non-flat, non-black center
- the label click, number keys, the Jump and View menus, the help and About dialogs, a guided tour, the NASA dispatch panel, the light pulse and Esc behave
- `#f=constructor` still starts the app at the system view
- a second spec serves a synthetic texture manifest and tiny images through route interception, then checks that a real surface is credited on the plate, a larger tier loads only for the focused body and is released on leaving it, the Texture detail item wraps back to 2k, and a manifest path that escapes `textures/` is ignored

`test/browser/missions.spec.mjs` serves a synthetic catalog through route interception and checks the index, the plate, the toggle, a link that names a mission and startup with an empty catalog.

Screenshots of each body are written to `test-results/screens/` for visual review. Pixel checks are coarse by design: a body can pass while mostly in shadow, so look at the screenshots.

Three.js and astronomy-engine come from `vendor/`, and NASA requests are stubbed, so the run needs no network. Tests run at 1000 x 640. The narrow-screen body strip below 860 px wide is not covered by this suite.

Software WebGL is slow. Expect the first load to take about one minute and the full run about seven on a single core. Set `PW_CHROMIUM` to the path of a Chromium binary to use a browser Playwright did not install. `.github/workflows/smoke.yml` runs the suite on pull requests, manual runs and before every deploy, and uploads `test-results/`.

## Hosting

`.github/workflows/pages.yml` runs the unit and browser tests, then publishes the static site to GitHub Pages only if both pass. To keep a NASA key off the client, deploy `deploy/nasa-proxy-worker.js` as a Cloudflare Worker with secret `NASA_API_KEY` and variable `ALLOW_ORIGIN` (comma separated list of the site origins allowed to call it, for example `https://you.github.io`), then either put the Worker URL in the `nasa-proxy` meta tag of `index.html` or set the repository variable `NASA_PROXY_URL`, which the deploy workflow writes into the published page. When a proxy is configured the key field in the dispatch panel is hidden. The page ships a Content Security Policy in `index.html`. The deploy workflow runs `tools/inject-proxy.mjs`, which validates the URL as https, escapes it into the meta tag and adds its origin to `connect-src`. If you change the inline import map, update the sha256 in the policy; `npm test` checks it. Without a proxy the key is sent in the query string and kept in localStorage, which is how api.nasa.gov expects it. The Worker refuses other origins, forwards only whitelisted paths and valid calendar dates, limits date ranges to 7 days for NeoWs and 31 days for DONKI, and never caches error responses. The Origin check only stops browsers, because other clients can send any Origin header. When a Workers rate limiting binding named `RATE_LIMITER` is configured, the Worker answers 429 once a client address exceeds it, before any upstream call. `deploy/wrangler.toml` shows a binding of 60 requests per minute per address; check the namespace and binding syntax against the current Cloudflare documentation for your Wrangler version. Without the binding there is no rate limiting.

The deploy workflow ships whatever is committed under `data/` and `textures/`. Set the repository variable `FETCH_TEXTURES` to `true` to have it download and convert the Earth and Moon 2k maps during deploy. Bodies whose sources need manual download are never fetched in CI. After fetching, the workflow runs `npm run textures:check -- Earth,Moon` and `npm test`, and pins sharp to 0.35.4. Add a `sha256` field to a source in `tools/texture-sources.json` to make `textures:fetch` verify the download; without one it prints a warning. The deploy workflow passes `--require-sha`, so pin a sha256 for every Earth and Moon source before setting `FETCH_TEXTURES`. When `FETCH_TEXTURES` or `BAKE_MISSIONS` is set, the workflow reruns the unit and browser tests on the fetched data before publishing. Set the repository variable `BAKE_MISSIONS` to `true` to run `npm run missions:fetch` during deploy, otherwise the shipped `data/missions.json` is used as is, and it is empty until you bake it.
