// Generates the default demo data for robot LM-001. No database code here,
// so it can be tested on its own. seed.js writes the result to PostgreSQL.
//
// The data is deterministic (same numbers on every run) and consistent:
//   - sessions, telemetry, events and forecasts describe the same timeline
//   - the story ends "now": the mower finished a session 22 minutes ago and
//     is charging on the dock (about 71%), waiting for the next command.

const TOTAL_AREA_M2 = 450;
const AREA_PER_MIN = 5.5; // m² mowed per minute
const DRAIN_PER_MIN = 0.82; // battery % used per mowing minute
const CHARGE_PER_MIN = 1.6; // battery % gained per charging minute
const HISTORY_DAYS = 56; // 8 weeks, matches the "8 weeks" chart

const MIN = 60 * 1000;
const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Small deterministic random generator (mulberry32)
function makeRandom(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Days (counted back from today) with an aborted session
const ABORTED = {
  38: { area: 210, obstacles: 3 },
  19: { area: 150, obstacles: 2 },
  5: { area: 96, obstacles: 5 }, // shows "Check needed" on the AI insights page
};

function buildSessions(now, rand) {
  const sessions = [];

  // One session every day, except every third day
  for (let back = HISTORY_DAYS; back >= 1; back--) {
    if (back % 3 === 0) continue;

    const day = new Date(now);
    day.setDate(day.getDate() - back);
    day.setHours(8, 30, 0, 0);
    const start = day.getTime() + Math.round((rand() - 0.5) * 90) * MIN;

    const aborted = ABORTED[back];
    const area = aborted ? aborted.area : round1(428 + rand() * 22); // >= 95% = Completed
    const duration = round1((area / AREA_PER_MIN) * (0.94 + rand() * 0.12));
    const batteryEnd = round1(clamp(100 - duration * DRAIN_PER_MIN * (0.95 + rand() * 0.1), 21, 100));
    const charging = round1(((100 - batteryEnd) / CHARGE_PER_MIN) * (0.9 + rand() * 0.2));

    sessions.push({
      start,
      end: start + duration * MIN,
      status: aborted ? "Aborted" : "Completed",
      area,
      duration,
      charging,
      chargingTotal: charging,
      batteryStart: 100,
      batteryEnd,
      obstacles: aborted ? aborted.obstacles : Math.floor(rand() * 4), // 0..3
      byOperator: Boolean(aborted),
    });
  }

  // Latest session: ended 22 minutes ago, the mower is still charging
  const duration = 78;
  const end = now - 22 * MIN;
  const batteryEnd = round1(100 - duration * DRAIN_PER_MIN);
  sessions.push({
    start: end - duration * MIN,
    end,
    status: "Completed",
    area: 441,
    duration,
    charging: 22, // charged so far
    chargingTotal: round1((100 - batteryEnd) / CHARGE_PER_MIN),
    batteryStart: 100,
    batteryEnd,
    obstacles: 1,
    byOperator: true,
  });

  return sessions;
}

// Where is the robot at time t? Derived from the session timeline.
function robotAt(t, sessions, now) {
  for (const s of sessions) {
    if (t >= s.start && t < s.end) {
      const p = (t - s.start) / (s.end - s.start);
      return {
        state: "mowing",
        battery: s.batteryStart - p * (s.batteryStart - s.batteryEnd),
        area: s.area * p,
      };
    }
    const chargeEnd = s.end + s.chargingTotal * MIN;
    if (t >= s.end && t < chargeEnd) {
      const battery = Math.min(100, s.batteryEnd + ((t - s.end) / MIN) * CHARGE_PER_MIN);
      return { state: "docked", battery, area: 0 };
    }
  }
  return { state: "docked", battery: 100, area: 0 };
}

// Battery samples: every 10 minutes for 24 hours, then every 2 seconds for the last 80 seconds
function buildTelemetry(now, sessions) {
  const times = [];
  for (let g = 144; g >= 1; g--) times.push(now - 80 * 1000 - g * 10 * MIN);
  for (let g = 39; g >= 0; g--) times.push(now - g * 2000);

  return times.map((ts) => {
    const r = robotAt(ts, sessions, now);
    return {
      ts,
      state: r.state,
      battery: round1(clamp(r.battery, 0, 100)),
      area: round1(r.area),
    };
  });
}

// "AI" forecast: close to the real value with a small deterministic wobble
function buildForecasts(telemetry) {
  return telemetry.map((t, i) => ({
    ts: t.ts,
    value: round1(clamp(t.battery + 1.8 * Math.sin(i / 4) + (t.state === "mowing" ? -1 : 0.5), 0, 100)),
  }));
}

function buildEvents(now, sessions, rand) {
  const events = [];
  const add = (ts, level, type, message) => events.push({ ts, level, type, message });
  const cutoff = now - 14 * 24 * 60 * MIN;
  const obstacleTexts = [
    "Obstacle detected, path adjusted",
    "Obstacle detected near flower bed",
    "Obstacle detected, garden hose",
  ];

  for (const s of sessions) {
    if (s.start < cutoff) continue;
    add(s.start, "OK", "state", "Mowing started");
    for (let i = 0; i < s.obstacles; i++) {
      const ts = s.start + Math.round((0.1 + rand() * 0.8) * (s.end - s.start));
      add(ts, "Warning", "obstacle", obstacleTexts[Math.floor(rand() * obstacleTexts.length)]);
    }
    if (s.byOperator && s.status === "Aborted") add(s.end - MIN, "Info", "command", "Command sent: dock");
    add(s.end, "Info", "state", "Returning to dock");
    add(s.end + 3 * MIN, "Info", "state", "Mower docked, charging");
  }

  const dayMs = 24 * 60 * MIN;
  add(now - 9 * dayMs, "Info", "maintenance", "Blade height adjusted");
  add(now - 20 * dayMs, "Info", "maintenance", "Firmware updated to 2.4.1");
  add(now - 26 * dayMs, "Info", "maintenance", "Blade sharpened");

  return events.filter((e) => e.ts <= now).sort((a, b) => a.ts - b.ts);
}

function buildDataset(now = Date.now()) {
  const rand = makeRandom(20261106);
  const sessions = buildSessions(now, rand);
  const telemetry = buildTelemetry(now, sessions);
  const forecasts = buildForecasts(telemetry);
  const events = buildEvents(now, sessions, rand);

  // The latest session was started by the operator
  const last = sessions[sessions.length - 1];
  const commands = [{ ts: last.start - 3000, type: "start" }];

  return { sessions, telemetry, forecasts, events, commands, totalArea: TOTAL_AREA_M2 };
}

module.exports = { buildDataset, TOTAL_AREA_M2 };
