# Cosmos

Repository name: cosmoscope.

A solar system you can scrub through time. Planet, Moon and Galilean moon positions come from an ephemeris, other moons use an approximate circular model (see Known limits), facts come from NASA, and a light pulse crosses the system at the real speed of light.

## Run

No install, no build. Serve the folder over HTTP (ES modules do not load from file://):

    python3 -m http.server 8000

Open http://localhost:8000. Three.js and astronomy-engine are served from the committed `vendor/` folder, so only the fonts and NASA feeds need internet access.

To change a library version, edit `devDependencies`, run `npm install` and `npm run vendor`, and commit `vendor/`. `npm test` fails if `vendor/` differs from the installed packages.

## Controls

Click a body or its label to fly to it. Drag to orbit, scroll to zoom. Press ? in the app for shortcuts. Shortcuts ignore key repeat and are suspended while the help dialog is open. Below 860 px wide the body list is hidden, but the System and Inner buttons and the Cosmos wordmark stay available. Editing the URL hash in the same tab is applied immediately. The URL hash stores the focused body, time scale, simulated date, and the paused and reversed states, so a link reproduces a view. A hash without a date means now. Choosing a date in the date field sets 12:00 in the selected time zone.

## Data and provenance

- Positions: astronomy-engine, computed locally for 1801 to 2198. The clock wraps outside that range.
- Pole directions: IAU rotation poles, so axial tilt azimuth and Saturn's ring plane are oriented correctly. Earth's spin uses apparent sidereal time rotated from the equinox of date into the J2000 frame the scene uses, which removes up to 2.5 degrees of precession offset at the ends of the date range. Other bodies use the IAU prime meridian angle (W0 and rate), so a supplied texture lines up with the real surface; periodic nutation terms are omitted.
- Planet facts: NASA NSSDC Planetary Fact Sheet, version of 18 March 2025. Mass, gravity, escape velocity, distance from Sun, inclination, eccentricity, obliquity, temperature, density, moons and rings were checked against that table. Mean radius, rotation period, Sun values, Saturn ring edges and pole directions were checked against the individual NSSDC fact sheets on 30 and 31 Oct 2026, and are pinned by `npm test` (fixture in `test/fixtures/nssdc.json`).
- Almanac block: moon phase, illumination, next solar and lunar eclipse, next lunar quarter and next solstice or equinox, all computed locally. Eclipse searches are correct in both time directions.
- NASA dispatch: APOD, NeoWs and DONKI through api.nasa.gov. DEMO_KEY is rate limited, so paste a free key into the panel. The feeds load the first time the panel is opened, not at page load. Responses are cached for one hour in localStorage.
- Sky: a procedural Milky Way tilted to the galactic plane and random stars. Not a catalog.
- Surfaces: Earth, Moon, Mars, Mercury, Venus and Pluto use NASA and USGS maps once `npm run textures:fetch` has been run (see Real textures). Everything else, and any body whose maps are missing, is generated procedurally and is not a photograph. The info plate states which one is shown.

## Real textures

Six bodies have NASA or USGS sources wired up in `tools/texture-sources.json`: Earth, Moon, Mars, Mercury, Venus and Pluto. Jupiter, Saturn, Uranus, Neptune and the Sun stay procedural.

    npm install --no-save sharp
    npm run textures:fetch

The tool downloads the full resolution originals into `out/originals/`, resizes them to 2k (2048 x 1024) JPEG maps under `textures/<Body>/2k/`, and writes `textures/manifest.json` from whatever is on disk. Run it again with `--tier 2k,4k,8k` to add larger maps, `--only Earth,Moon` to limit bodies, `--force` to re-download, and `--manifest` to rebuild the manifest from disk without converting anything. Tiers larger than the source are skipped, never upscaled.

Sources with no download URL in `tools/texture-sources.json` (Mars, Mercury, Venus, Pluto) must be saved by hand as `out/originals/<Body>_<slot>.tif`, `.jpg` or `.png`. The product name to look for is printed when one is missing. Originals must be 2:1 equirectangular.

Detail on demand: the 2k maps load at startup. When 4k or 8k maps exist, a Texture detail item appears in the View menu. The chosen detail is loaded only for the focused body and released when focus moves away, because one 8k map costs roughly 170 MB of GPU memory with mipmaps and a body can use several maps at once. A tier change reloads only the slots whose file differs.

Manifest format, written by the tool and also accepted by hand:

    {
      "version": 2,
      "bodies": {
        "Earth": {
          "credit": "NASA Earth Observatory",
          "license": "Public domain",
          "url": "https://visibleearth.nasa.gov/",
          "centerLon": 0,
          "tiers": {
            "2k": { "map": "Earth/2k/map.jpg", "lights": "Earth/2k/lights.jpg", "cloudMask": "Earth/2k/cloudMask.jpg" },
            "4k": { "map": "Earth/4k/map.jpg" }
          }
        }
      }
    }

Slots: `map`, `bump`, `rough`, `lights`, `clouds`, `cloudMask`. `cloudMask` is a grayscale image used as cloud opacity, for sources such as the NASA cloud composite that have no alpha channel. A slot missing at the requested tier falls back to the nearest tier that has it. `centerLon` is the east longitude at the image center, and `bumpScale` tunes relief strength. The old flat format (`"Mars": { "map": "mars.jpg" }`) still loads and is read as the 2k tier. Paths must be relative and are rejected if they contain `..`. A body without a loadable `map` stays procedural.

The longitude convention is the part most likely to need adjusting. If a surface looks rotated against the Greenwich or prime meridian, set `centerLon` for that body in `tools/texture-sources.json`, rerun with `--manifest`, and compare against a known feature.

## Credits

All maps are NASA or USGS products, which are generally public domain. Confirm the license on each product page before redistributing.

- Earth: NASA Earth Observatory, Blue Marble Next Generation, Black Marble 2012 and the cloud composite (https://visibleearth.nasa.gov/).
- Moon: NASA/GSFC/Arizona State University LRO LROC WAC color mosaic and LOLA elevation (https://svs.gsfc.nasa.gov/4720/).
- Mars: NASA/JPL/USGS Viking MDIM 2.1 color mosaic and MGS MOLA elevation.
- Mercury: NASA/JHUAPL/Carnegie Institution of Washington/USGS MESSENGER MDIS global mosaic.
- Venus: NASA/JPL/USGS Magellan SAR global mosaic. This is a radar view of the surface, not what the cloud-covered planet looks like.
- Pluto: NASA/JHUAPL/SwRI New Horizons LORRI and MVIC global mosaic. Coverage of the far hemisphere is low resolution.

The credit, license and link for the focused body are also shown on its info plate.

## Scale

Orbits and positions are always true. Planet sizes and the Moon's orbit radius are exaggerated by default, because true-scale planets are sub-pixel at any zoom that shows their orbits. The Size toggle switches to true scale, and the interface always states which mode is active.

## Light pulse

The pulse expands from the Sun at 299,792.458 km/s of simulated time. Sending it sets the time scale to 1 s = 5 min if the current scale would make it invisible or instant. The ruler shows elapsed light time, with the axis range growing as the pulse travels.

## Known limits

- Orbit trails are one sampled period and rebuild after 25 simulated years of drift.
- The Moon orbit ring is drawn in the Moon's instantaneous orbital plane, so it carries the 5 degree inclination, but it is a circle at an exaggerated radius, not the true ellipse.
- Bodies without real maps use procedural surfaces. Before textures are fetched, that includes Earth's continents, which are not real geography.
- Texture map orientation and relief strength have not been checked against the real surface for every product. See the note on `centerLon` above.
- Planet lighting is the Sun at full strength with a softened distance falloff that follows the focused body, not true inverse square. Saturn's rings are lit and cast the planet's shadow.
- Only Saturn's rings are drawn.
- Phobos, Deimos, Titan and Triton follow circular orbits in the parent's equatorial plane with a fixed phase and period at J2000. Their positions are approximate and drift from reality far from the year 2000, and Triton's inclined retrograde orbit is only roughly represented. Only the Moon and the four Galilean moons use the ephemeris.
- Uranus's moons and Pluto's Charon are not drawn.
- Eclipse shadows are physically meaningful only at true scale. The eclipse Moments switch to true scale and restore the previous size mode when focus moves on.
- Spin of fast rotators at high time scales is cosmetic and blends back to the true angle when the time scale drops.
- Exoplanets, nearby stars and a real star catalog are not built yet.

## Tests and diagnostics

`npm install && npm test` runs data, orientation, clock, formatting, spin blending, pulse timing, eclipse cache and ephemeris checks. Ephemeris checks need `astronomy-engine` and are skipped without it. Press D in the app for frame rate, GPU name, shader fallback state and texture build time. `npm run textures` writes the procedural maps to `out/textures/` for inspection. `npm test` also covers manifest parsing, path safety and tier fallback. `test/world.test.mjs` drives `createWorld` with a headless renderer and a stub canvas to check that every body builds, textures load, positions and rotations stay finite, fast spin does not snap, trails upload only when needed and the light pulse reports each planet once. It needs `vendor/` and does not cover actual rendering.

## UI logic tests

`npm run test:ui` loads `src/main.js` in jsdom against a fake world and drives frames by hand. It covers key handling (Space on buttons, key repeat, the help dialog), the live clock across a stalled frame and after a date jump, hash edits including pause and reverse flags, NASA panel retry after a failed load, the almanac rows, and the clock wrap stopping the light pulse. It needs no browser and no WebGL, and it does not cover rendering.

## Browser smoke tests

`npm install && npx playwright install chromium && npm run test:browser` starts a local static server and drives headless Chromium with software WebGL. The run loads the page, waits for the intro to clear and for textures to finish, then checks:

- no console errors, page errors, failed requests or HTTP 4xx and 5xx responses, and no shader or texture warnings
- the diagnostics panel reports no shader fallback
- every body in the index can be focused, shows its plate, is picked by the cursor at the screen center, and renders a non-flat, non-black center
- the label click, number keys, the Jump and View menus, the help dialog, the NASA dispatch panel, the light pulse and Esc behave
- `#f=constructor` still starts the app at the system view
- a second spec serves a synthetic texture manifest and tiny images through route interception, then checks that a real surface is credited on the plate, a larger tier loads only for the focused body and is released on leaving it, the Texture detail item wraps back to 2k, and a manifest path that escapes `textures/` is ignored

Screenshots of each body are written to `test-results/screens/` for visual review. Pixel checks are coarse by design: a body can pass while mostly in shadow, so look at the screenshots.

Three.js and astronomy-engine come from `vendor/`, and NASA and font requests are stubbed, so the run needs no network. Tests run at 1000 x 640 because the body list is hidden below 860 px wide, which this suite does not cover.

Software WebGL is slow. Expect the first load to take about one minute and the full run about seven on a single core. Set `PW_CHROMIUM` to the path of a Chromium binary to use a browser Playwright did not install. `.github/workflows/smoke.yml` runs the suite on pull requests, manual runs and before every deploy, and uploads `test-results/`.

## Hosting

`.github/workflows/pages.yml` runs the unit and browser tests, then publishes the static site to GitHub Pages only if both pass. To keep a NASA key off the client, deploy `deploy/nasa-proxy-worker.js` as a Cloudflare Worker with secret `NASA_API_KEY` and variable `ALLOW_ORIGIN` (comma separated list of the site origins allowed to call it, for example `https://you.github.io`), then either put the Worker URL in the `nasa-proxy` meta tag of `index.html` or set the repository variable `NASA_PROXY_URL`, which the deploy workflow writes into the published page. When a proxy is configured the key field in the dispatch panel is hidden. The Worker refuses other origins, forwards only whitelisted paths and valid calendar dates, limits date ranges to 7 days for NeoWs and 31 days for DONKI, and never caches error responses. The Origin check only stops browsers, because other clients can send any Origin header. When a Workers rate limiting binding named `RATE_LIMITER` is configured, the Worker answers 429 once a client address exceeds it, before any upstream call. `deploy/wrangler.toml` shows a binding of 60 requests per minute per address; check the namespace and binding syntax against the current Cloudflare documentation for your Wrangler version. Without the binding there is no rate limiting.

The deploy workflow ships whatever is committed under `textures/`. Set the repository variable `FETCH_TEXTURES` to `true` to have it download and convert the Earth and Moon 2k maps during deploy. Bodies whose sources need manual download are never fetched in CI.
