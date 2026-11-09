export function formatDuration(sec) {
  const s = Math.abs(sec);
  if (s < 0.9995) return `${(s * 1000).toFixed(0)} ms`;
  if (s < 59.95) return `${s.toFixed(1)} s`;
  if (s < 3599.5) {
    const t = Math.round(s);
    return `${Math.floor(t / 60)} min ${t % 60} s`;
  }
  if (s < 86370) {
    const t = Math.round(s / 60);
    return `${Math.floor(t / 60)} h ${t % 60} min`;
  }
  if (s < 86400 * 365.25) return plural(trim(s / 86400), "day");
  const y = s / (86400 * 365.25);
  return plural(y < 10 ? Number(y.toFixed(2)).toString() : trim(y), "year");
}

function trim(x) {
  return Number(x.toFixed(1)).toString();
}

function plural(value, word) {
  return `${value} ${word}${Number(value) === 1 ? "" : "s"}`;
}

const UNIT_CHAIN = [
  ["min", 60, 60],
  ["hr", 3600, 24],
  ["day", 86400, 7],
  ["week", 604800, 30 / 7],
  ["month", 2629800, 11.52],
  ["year", 31557600, Infinity],
];

export function formatUnit(sec) {
  if (sec < 59.5) return `${Math.round(sec)} s`;
  for (const [name, size, max] of UNIT_CHAIN) {
    if (Number((sec / size).toFixed(1)) < max) return plural(trim(sec / size), name);
  }
  return plural(trim(sec / 31557600), "year");
}

export function formatRate(scale) {
  if (scale < 1.05) return "Real time";
  return `1 s = ${formatUnit(scale)}`;
}

export function formatOffset(ms) {
  const sec = Math.abs(ms) / 1000;
  const label = ms < 0 ? "before now" : "after now";
  return `${formatUnit(sec)} ${label}`;
}

export function fmtNum(n, sig = 4) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  if (n === 0) return "0";
  if (Math.abs(n) >= 10000) return Math.round(n).toLocaleString("en-US");
  const p = Number(n.toPrecision(sig));
  if (Math.abs(p) >= 1e-6) return p.toString();
  return p.toExponential(sig - 1).replace(/\.?0+e/, "e");
}

export function fmtCeil(n, sig = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  if (n <= 0) return "0";
  const exp = Math.floor(Math.log10(n)) - (sig - 1);
  const unit = 10 ** exp;
  return fmtNum(Math.ceil(n / unit - 1e-9) * unit, sig);
}

export function formatGravity(g) {
  if (g === null || g === undefined || !Number.isFinite(g)) return "n/a";
  return g >= 1 ? g.toFixed(1) : fmtNum(g, 2);
}

export function formatMass(massE24) {
  if (massE24 === null || massE24 === undefined || !Number.isFinite(massE24) || massE24 <= 0) return "n/a";
  if (massE24 >= 0.01 && massE24 < 10000) return `${fmtNum(massE24)} x 10<sup>24</sup> kg`;
  const kg = massE24 * 1e24;
  let exp = Math.floor(Math.log10(kg));
  let mant = Number((kg / 10 ** exp).toPrecision(4));
  if (mant >= 10) {
    mant /= 10;
    exp += 1;
  }
  return `${mant} x 10<sup>${exp}</sup> kg`;
}

export function formatAU(au) {
  if (au < 0.01) return au.toFixed(5);
  if (au < 10) return au.toFixed(3);
  return au.toFixed(2);
}

const ZONES = {
  local: undefined,
  utc: "UTC",
};

export function createClock() {
  const make = (zone) => ({
    date: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: zone }),
    time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: zone }),
    zone: new Intl.DateTimeFormat("en-GB", { timeZoneName: "short", timeZone: zone }),
  });
  const sets = { local: make(ZONES.local), utc: make(ZONES.utc) };
  return (ms, mode) => {
    const f = sets[mode];
    const d = new Date(ms);
    const zonePart = f.zone.formatToParts(d).find((p) => p.type === "timeZoneName");
    return { date: f.date.format(d), time: f.time.format(d), zone: zonePart ? zonePart.value : "UTC" };
  };
}

export function shortDate(ms) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
