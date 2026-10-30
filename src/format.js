export function formatDuration(sec) {
  const s = Math.abs(sec);
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
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
  return y < 10 ? `${y.toFixed(2)} years` : `${y.toFixed(1)} years`;
}

function trim(x) {
  return Number(x.toFixed(1)).toString();
}

function plural(value, word) {
  return `${value} ${word}${Number(value) === 1 ? "" : "s"}`;
}

export function formatUnit(sec) {
  if (sec < 60) return `${Math.round(sec)} s`;
  if (sec < 3600) return `${trim(sec / 60)} min`;
  if (sec < 86400) return `${trim(sec / 3600)} hr`;
  if (sec < 86400 * 7) return plural(trim(sec / 86400), "day");
  if (sec < 86400 * 30) return plural(trim(sec / 604800), "week");
  if (sec < 86400 * 365) return plural(trim(sec / 2629800), "month");
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
  if (n === null || n === undefined) return "n/a";
  if (Math.abs(n) >= 10000) return Math.round(n).toLocaleString("en-US");
  return Number(n.toPrecision(sig)).toString();
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
