# Cosmos

A solar system you can scrub through time. Planet and Moon positions come from an ephemeris, facts come from NASA, and a light pulse crosses the system at the real speed of light.

## Run

No install, no build. Serve the folder over HTTP (ES modules do not load from file://):

    python3 -m http.server 8000

Open http://localhost:8000. Three.js, astronomy-engine and the fonts load from CDNs, so you need internet access.

## Controls

Click a body or its label to fly to it. Drag to orbit, scroll to zoom. Press ? in the app for shortcuts. The URL hash stores the focused body, time scale and simulated date, so a link reproduces a view.

## Data and provenance

- Positions: astronomy-engine, computed locally for 1801 to 2198. The clock wraps outside that range.
- Pole directions: IAU rotation poles, so axial tilt azimuth and Saturn's ring plane are oriented correctly. Earth's spin uses real sidereal time.
- Planet facts: NASA NSSDC Planetary Fact Sheet, version of 18 March 2025. Mass, gravity, escape velocity, distance from Sun, inclination, eccentricity, obliquity, temperature, density, moons and rings were checked against that table. Mean radius, rotation period and all Sun values come from the individual fact sheets and were not re-checked.
- Almanac block: moon phase, illumination, next lunar quarter and next solstice or equinox, all computed locally.
- NASA dispatch: APOD, NeoWs and DONKI through api.nasa.gov. DEMO_KEY is rate limited, so paste a free key into the panel. Responses are cached for one hour in localStorage.
- Sky: a procedural Milky Way tilted to the galactic plane and random stars. Not a catalog.
- Surfaces: generated procedurally. They are not photographs.

## Real textures

Create image files in `textures/` and list them in `textures/manifest.json`. Images must be equirectangular with longitude 0 at the image center.

    {
      "Earth": { "map": "earth_day.jpg", "lights": "earth_night.jpg", "clouds": "earth_clouds.png", "rough": "earth_water_mask.jpg" },
      "Mars": { "map": "mars.jpg" },
      "Jupiter": { "map": "jupiter.jpg" }
    }

Slots: `map`, `bump`, `rough`, `lights`, `clouds`. Any body listed replaces its procedural surface, and the info plate says so. Check each image's license before publishing. NASA Visible Earth and NASA/JPL maps are generally public domain. Solar System Scope textures are CC BY 4.0 and are not NASA.

## Scale

Orbits and positions are always true. Planet sizes and the Moon's orbit radius are exaggerated by default, because true-scale planets are sub-pixel at any zoom that shows their orbits. The Size toggle switches to true scale, and the interface always states which mode is active.

## Light pulse

The pulse expands from the Sun at 299,792.458 km/s of simulated time. Sending it sets the time scale to 1 s = 5 min if the current scale would make it invisible or instant. The ruler shows elapsed light time, with the axis range growing as the pulse travels.

## Known limits

- Orbit trails are one sampled period and rebuild after 25 simulated years of drift.
- The Moon orbit ring is drawn in the ecliptic plane, not at its 5 degree inclination.
- Only Saturn's rings are drawn.
- Exoplanets, nearby stars and a real star catalog are not built yet.
