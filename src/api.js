// All requests to the backend live here. Components never call fetch directly.
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

// The prototype shows one robot (LM-001 has id 1 after the seed script)
export const ROBOT_ID = 1;

async function request(path, options) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    const error = new Error(`Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

const shortDate = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Events from today show the time; older events also show the date
function eventTime(iso) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString("en-GB");
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${day} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

const mapSession = (r) => ({
  id: `Session ${r.id}`,
  status: r.status,
  area_m2: Math.round(r.area_m2),
  date: shortDate(r.started_at),
  duration_min: Math.round(r.duration_min),
  battery_start_pct: Math.round(r.battery_start_pct),
  battery_end_pct: Math.round(r.battery_end_pct),
  obstacles: r.obstacles_count,
});

const mapEvent = (r) => ({
  id: r.id,
  message: r.message,
  level: r.level,
  time: eventTime(r.ts),
});

// These functions are defined once, so the polling hook can use them as stable inputs
export const getStatus = () => request(`/robots/${ROBOT_ID}/status`);
export const getSummary = () => request(`/robots/${ROBOT_ID}/summary`);
export const getInsights = () => request(`/robots/${ROBOT_ID}/insights`);
export const getSessions = () =>
  request(`/robots/${ROBOT_ID}/sessions?limit=20`).then((rows) => rows.map(mapSession));
export const getEvents = () =>
  request(`/robots/${ROBOT_ID}/events?limit=20`).then((rows) => rows.map(mapEvent));

// range: "live" or "day"
export const getBattery = (range) => request(`/robots/${ROBOT_ID}/battery?range=${range}`);
// range: "week" or "month"
export const getActivity = (range) => request(`/robots/${ROBOT_ID}/activity?range=${range}`);

// type: "start", "pause" or "dock"
export const sendCommand = (type) =>
  request(`/robots/${ROBOT_ID}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
