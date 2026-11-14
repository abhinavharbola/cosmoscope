# Cosmos

A solar system you can scrub through time, from 1801 to 2198. Fly to any planet or major moon, run the clock at up to a decade per second or backwards, watch an eclipse happen, or send a pulse of light out from the Sun and see how long it takes to arrive.

Positions are computed in your browser from an ephemeris and facts come from NASA. There is no build step and no backend.

## Features

- Planets, the Moon and the Galilean moons placed by the astronomy-engine ephemeris, with IAU rotation poles and prime meridians so surfaces face the right way.
- Solar and lunar eclipses with a real shadow, plus an almanac for the sky on any date: moon phase, next eclipses, quarters and seasons.
- A light pulse that crosses the system at 299,792.458 km/s of simulated time, with a ruler showing when it reaches each planet.
- Spacecraft, comets and asteroids from NASA/JPL Horizons trajectories, baked into a static file.
- NASA and USGS surface maps for Earth, Moon, Mars, Mercury, Venus and Pluto, with larger maps loaded only for the body you are looking at.
- Guided tours of the planets, the moons and two total eclipses, in the Jump menu.
- Shareable links that carry the focused body, date, time scale and camera angle.
- A dispatch panel with NASA's Astronomy Picture of the Day, near-Earth objects and solar flares.

## Run

Clone the repository and serve the folder over HTTP, since ES modules do not load from `file://`:

    python3 -m http.server 8000

Then open http://localhost:8000. Three.js, astronomy-engine and the fonts are committed, so only the NASA feeds need internet access.

## Controls

Click a body or its label to fly to it. Drag to orbit and scroll to zoom. Press `?` for keyboard shortcuts. The Jump menu holds the date picker, guided tours and notable moments. The View menu holds the size, trail, label, mission and texture options, and an About dialog with credits.

The URL updates as you explore. Copy it to share the same body, moment, speed and framing. Planet sizes are exaggerated by default so they are visible, and the interface says so. Orbits and positions are always true.

## Data

Real surface maps and mission trajectories are fetched once and committed, not requested while you browse. See [docs/DATA.md](docs/DATA.md) for sources, the fetch and bake commands, texture format, credits and the known limits of the model.

## Developing

See [docs/DEVELOPING.md](docs/DEVELOPING.md) for the source layout, the test suites, and deployment to GitHub Pages with an optional Cloudflare Worker that keeps a NASA API key off the client.

    npm install
    npm test
    npm run test:ui

## Credits

Positions by [astronomy-engine](https://github.com/cosinekitty/astronomy). Planetary facts from the [NASA NSSDC Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/). Trajectories from [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/). Maps from NASA and USGS. Rendered with [Three.js](https://threejs.org). Full credits are in the app under View, About and credits, and in [docs/DATA.md](docs/DATA.md).
