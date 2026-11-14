import { $ } from "./dom.js";

export const TOURS = [
  {
    id: "planets",
    title: "The planets",
    blurb: "Ten stops, Sun to Pluto",
    steps: [
      {
        focus: "Overview",
        when: "now",
        scale: 86400,
        text: "The whole system at today's date, with time running at one day per second. Orbits are drawn true, but planet sizes are exaggerated so you can see them.",
      },
      {
        focus: "Mercury",
        scale: 3600,
        text: "Mercury circles the Sun every 88 days, but it turns so slowly that one solar day lasts two of its years.",
      },
      { focus: "Venus", scale: 3600, text: "Venus spins backwards, and one rotation takes longer than its year." },
      {
        focus: "Earth",
        scale: 3600,
        text: "Earth is the only known world with liquid surface water and life. Sunlight takes about eight minutes to get here.",
      },
      {
        focus: "Mars",
        scale: 3600,
        text: "Mars has the tallest known volcano in the solar system, Olympus Mons. Its two moons, Phobos and Deimos, are only about 22 and 12 km across.",
      },
      {
        focus: "Jupiter",
        scale: 3600,
        text: "Jupiter has more than twice the mass of all the other planets combined, and it turns once in under ten hours.",
      },
      {
        focus: "Saturn",
        scale: 3600,
        text: "Saturn is the least dense planet: it would float in a large enough bathtub. Its rings run from about 75,000 to 137,000 km from the planet's center.",
      },
      {
        focus: "Uranus",
        scale: 3600,
        text: "Uranus is tipped on its side, with an axial tilt of nearly 98 degrees, so over its 84-year orbit each pole takes a turn facing the Sun.",
      },
      {
        focus: "Neptune",
        scale: 3600,
        text: "Neptune is the windiest world in the solar system, with winds of about 2,000 km/h. Sunlight takes more than four hours to reach it.",
      },
      {
        focus: "Pluto",
        scale: 3600,
        text: "Pluto takes about 248 years to circle the Sun, on an orbit tilted 17 degrees. New Horizons flew past it in July 2015.",
      },
    ],
  },
  {
    id: "moons",
    title: "The moons",
    blurb: "Six worlds orbiting worlds",
    steps: [
      {
        focus: "Moon",
        when: "now",
        scale: 3600,
        text: "The Moon is tidally locked to Earth, so it always shows us the same face, and it drifts away by about 3.8 cm each year.",
      },
      {
        focus: "Io",
        scale: 3600,
        text: "Io is the most volcanically active body in the solar system, squeezed by Jupiter's tides.",
      },
      { focus: "Europa", scale: 3600, text: "Europa's cracked ice shell likely hides a global saltwater ocean." },
      {
        focus: "Ganymede",
        scale: 3600,
        text: "Ganymede is the largest moon in the solar system, bigger than Mercury. Io, Europa, Ganymede and Callisto follow the ephemeris.",
      },
      {
        focus: "Titan",
        scale: 3600,
        text: "Titan is the only moon with a thick atmosphere. Its orbit here is an illustrative circle, not an ephemeris.",
      },
      {
        focus: "Triton",
        scale: 3600,
        text: "Triton orbits Neptune backwards, a likely captured Kuiper Belt object. Its orbit here is illustrative as well.",
      },
    ],
  },
  {
    id: "eclipses",
    title: "Eclipses",
    blurb: "Two total solar eclipses",
    steps: [
      {
        focus: "Earth",
        when: "2024-04-08T18:17:16Z",
        scale: 30,
        eclipse: true,
        text: "8 April 2024, near the moment of greatest eclipse. The Moon's shadow falls across Earth. Shadows are only meaningful at true scale, so the view switches to it for this stop.",
      },
      {
        focus: "Earth",
        when: "2027-08-02T10:06:41Z",
        scale: 30,
        eclipse: true,
        text: "2 August 2027. A total eclipse whose path crosses Egypt, with Luxor near the point of greatest eclipse.",
      },
    ],
  },
];

export function createTours({ goTo, closeMenus }) {
  const card = $("tour");
  let tour = null;
  let index = 0;

  function render() {
    const step = tour.steps[index];
    $("tour-title").textContent = tour.title;
    $("tour-count").textContent = `${index + 1} of ${tour.steps.length}`;
    $("tour-text").textContent = step.text;
    $("tour-prev").disabled = index === 0;
    $("tour-next").textContent = index === tour.steps.length - 1 ? "Finish" : "Next";
  }

  function show(i) {
    index = i;
    goTo(tour.steps[i]);
    render();
  }

  function stop() {
    tour = null;
    card.hidden = true;
  }

  function start(id) {
    const found = TOURS.find((t) => t.id === id);
    if (!found) return;
    tour = found;
    card.hidden = false;
    show(0);
  }

  function next() {
    if (!tour) return;
    if (index >= tour.steps.length - 1) stop();
    else show(index + 1);
  }

  function prev() {
    if (tour && index > 0) show(index - 1);
  }

  TOURS.forEach((t) => {
    const b = document.createElement("button");
    b.textContent = t.title;
    const small = document.createElement("small");
    small.textContent = t.blurb;
    b.appendChild(small);
    b.addEventListener("click", () => {
      closeMenus();
      start(t.id);
    });
    $("tours").appendChild(b);
  });

  $("tour-next").addEventListener("click", next);
  $("tour-prev").addEventListener("click", prev);
  $("tour-exit").addEventListener("click", stop);

  return { start, stop, next, prev, isActive: () => tour !== null };
}
