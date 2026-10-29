# Cosmos

3D solar system driven by real ephemerides, with NASA fact sheet data and live NASA feeds.

## Run

No install and no build step. Serve the folder over HTTP (ES modules do not load from file://):

    python3 -m http.server 8000

Open http://localhost:8000. Three.js and astronomy-engine load from jsDelivr via the import map in index.html.

## Data sources

- Positions: astronomy-engine, evaluated locally for any date between 1801 and 2198. The clock wraps outside that range.
- Planet facts: NASA NSSDC Planetary Fact Sheet, transcribed into src/data.js. Re-verify against the source before publishing; moon counts change.
- Landing panel: NASA APOD, NeoWs and DONKI through api.nasa.gov. DEMO_KEY is rate limited, so paste a free key into the panel. Responses are cached for one hour in localStorage.
- Textures: procedural placeholders generated in the browser. To use real imagery, replace the map in src/world.js buildBody with a TextureLoader load of a NASA Visible Earth or JPL image.
- Background stars: random decorative points, not a catalog.

## Design decisions

- Floating origin: every body is placed relative to the focused body using double precision JS math, so the GPU never sees large coordinates.
- Logarithmic depth buffer enabled, near plane 1e-8 AU, so true-scale planets survive extreme zoom.
- Sizes are exaggerated by default. Orbits and positions are always true. The Moon orbit is exaggerated unless true scale is on.
- Time scale: seconds of simulated time per real second, 1 s to 10 years. Spin switches to a slow ambient rotation when true spin would alias at 60 fps.
- Light pulse: expands from the Sun at 299,792.458 km/s in simulated time, so at real time Earth is reached after about 8 min 19 s. Arrivals are logged with the exact travel time.

## Known limits

- Orbit lines are one sampled period from load time and do not update for long time jumps.
- Moon orbit ring is drawn in the ecliptic plane, not at its true 5 degree inclination.
- Cosmos layer (nearby stars, exoplanets, Hipparcos or Gaia) is phase 3 and not built.
