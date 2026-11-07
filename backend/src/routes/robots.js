// Routes used by the dashboard (read data, send operator commands)
const { Router } = require("express");
const { query } = require("../db");
const { Command } = require("../schemas");
const { HEALTH_KINDS } = require("../insights");

const router = Router();

// The robot must be at least this charged to mow; below it the AI estimate is 0
const RETURN_THRESHOLD_PCT = 20;
// A session with this many obstacles (or more) is flagged as unusual
const ANOMALY_OBSTACLES = 5;

// Validate the robot id once for every route that has :id
router.param("id", (req, res, next, value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "invalid robot id" });
  }
  req.robotId = id;
  next();
});

function limitFrom(req, fallback, max) {
  const n = Number(req.query.limit);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

// Latest state of one robot
router.get("/robots/:id/status", async (req, res) => {
  const { rows } = await query(
    `SELECT t.battery_pct, t.state, t.area_m2, t.ts,
            r.name, r.last_seen_at, r.total_area_m2,
            t.battery_pct - COALESCE(
              (SELECT s.battery_pct FROM telemetry_samples s
               WHERE s.robot_id = $1 AND s.ts >= now() - interval '5 minutes'
               ORDER BY s.ts ASC LIMIT 1),
              t.battery_pct) AS battery_change
     FROM telemetry_samples t
     JOIN robots r ON r.id = t.robot_id
     WHERE t.robot_id = $1
     ORDER BY t.ts DESC
     LIMIT 1`,
    [req.robotId],
  );
  const r = rows[0];
  if (!r) return res.status(404).json({ error: "no data yet" });

  const lastSeen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
  res.json({
    robot_id: req.robotId,
    name: r.name,
    battery_pct: r.battery_pct,
    battery_change: r.battery_change,
    state: r.state,
    area_m2: r.area_m2,
    total_area_m2: r.total_area_m2,
    ts: r.ts,
    last_seen_at: r.last_seen_at,
    online: Date.now() - lastSeen < 15000,
  });
});

// Battery series for the chart: actual and predicted values
// range=live  -> the latest samples
// range=day   -> hourly averages of the last 24 hours
router.get("/robots/:id/battery", async (req, res) => {
  if (req.query.range === "day") {
    const { rows } = await query(
      `WITH a AS (
         SELECT date_trunc('hour', ts) AS h, AVG(battery_pct)::float8 AS v
         FROM telemetry_samples
         WHERE robot_id = $1 AND ts >= now() - interval '24 hours'
         GROUP BY 1
       ), p AS (
         SELECT date_trunc('hour', ts) AS h, AVG(value)::float8 AS v
         FROM predictions
         WHERE robot_id = $1 AND kind = 'battery_forecast' AND ts >= now() - interval '24 hours'
         GROUP BY 1
       )
       SELECT a.h AS ts, a.v AS actual, p.v AS predicted
       FROM a LEFT JOIN p ON p.h = a.h
       ORDER BY a.h ASC`,
      [req.robotId],
    );
    return res.json(rows);
  }

  const { rows } = await query(
    `SELECT t.ts, t.battery_pct AS actual, p.value AS predicted
     FROM (
       SELECT ts, battery_pct FROM telemetry_samples
       WHERE robot_id = $1 ORDER BY ts DESC LIMIT $2
     ) t
     LEFT JOIN LATERAL (
       SELECT value FROM predictions
       WHERE robot_id = $1 AND kind = 'battery_forecast' AND ts <= t.ts
       ORDER BY ts DESC LIMIT 1
     ) p ON true
     ORDER BY t.ts ASC`,
    [req.robotId, limitFrom(req, 40, 500)],
  );
  res.json(rows);
});

// Mowing and charging minutes per day (range=week) or per week (range=month).
// The series is generated first, so days without sessions still show as 0.
router.get("/robots/:id/activity", async (req, res) => {
  if (req.query.range === "month") {
    const { rows } = await query(
      `SELECT ('W' || row_number() OVER (ORDER BY gs.week_start))::text AS name,
              COALESCE(SUM(s.duration_min), 0)::int AS mowing,
              COALESCE(SUM(s.charging_min), 0)::int AS charging
       FROM generate_series(
              date_trunc('week', now()) - interval '49 days',
              date_trunc('week', now()),
              interval '7 days') AS gs(week_start)
       LEFT JOIN mowing_sessions s
         ON s.robot_id = $1
        AND s.started_at >= gs.week_start
        AND s.started_at < gs.week_start + interval '7 days'
       GROUP BY gs.week_start
       ORDER BY gs.week_start`,
      [req.robotId],
    );
    return res.json(rows);
  }

  const { rows } = await query(
    `SELECT to_char(gs.day_start, 'Dy') AS name,
            COALESCE(SUM(s.duration_min), 0)::int AS mowing,
            COALESCE(SUM(s.charging_min), 0)::int AS charging
     FROM generate_series(
            date_trunc('day', now()) - interval '6 days',
            date_trunc('day', now()),
            interval '1 day') AS gs(day_start)
     LEFT JOIN mowing_sessions s
       ON s.robot_id = $1
      AND s.started_at >= gs.day_start
      AND s.started_at < gs.day_start + interval '1 day'
     GROUP BY gs.day_start
     ORDER BY gs.day_start`,
    [req.robotId],
  );
  res.json(rows);
});

// Totals for the stat cards (this week and the week before)
router.get("/robots/:id/summary", async (req, res) => {
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(area_m2) FILTER (WHERE started_at >= now() - interval '7 days'), 0)::float8 AS area_cur,
       COALESCE(SUM(area_m2) FILTER (WHERE started_at >= now() - interval '14 days'
                                       AND started_at < now() - interval '7 days'), 0)::float8 AS area_prev,
       COALESCE(SUM(duration_min) FILTER (WHERE started_at >= now() - interval '7 days'), 0)::float8 AS duration_cur,
       COALESCE(SUM(duration_min) FILTER (WHERE started_at >= now() - interval '14 days'
                                            AND started_at < now() - interval '7 days'), 0)::float8 AS duration_prev
     FROM mowing_sessions
     WHERE robot_id = $1`,
    [req.robotId],
  );
  res.json(rows[0]);
});

// Numbers for the "AI insights" page.
// - minutes_left: battery above the return threshold / average drain per mowing minute
// - health and maintenance_days: latest values written by the AI module (predictions table)
// - anomaly: a recent session with an unusual number of obstacles
router.get("/robots/:id/insights", async (req, res) => {
  const [latest, drain, stored, anomaly] = await Promise.all([
    query(
      "SELECT battery_pct FROM telemetry_samples WHERE robot_id = $1 ORDER BY ts DESC LIMIT 1",
      [req.robotId],
    ),
    // Battery used per mowing minute over the last 10 finished sessions
    query(
      `SELECT (SUM(battery_start_pct - battery_end_pct) / NULLIF(SUM(duration_min), 0))::float8 AS per_min
       FROM (
         SELECT battery_start_pct, battery_end_pct, duration_min
         FROM mowing_sessions
         WHERE robot_id = $1 AND ended_at IS NOT NULL AND duration_min > 0
         ORDER BY started_at DESC LIMIT 10
       ) s`,
      [req.robotId],
    ),
    query(
      `SELECT DISTINCT ON (kind) kind, value
       FROM predictions
       WHERE robot_id = $1 AND kind = ANY($2)
       ORDER BY kind, ts DESC`,
      [req.robotId, HEALTH_KINDS],
    ),
    query(
      `SELECT id, obstacles_count
       FROM mowing_sessions
       WHERE robot_id = $1 AND obstacles_count >= $2 AND started_at >= now() - interval '14 days'
       ORDER BY started_at DESC LIMIT 1`,
      [req.robotId, ANOMALY_OBSTACLES],
    ),
  ]);

  const battery = latest.rows[0]?.battery_pct;
  const perMin = drain.rows[0]?.per_min;
  const minutesLeft =
    battery != null && perMin > 0
      ? Math.round(Math.max(0, battery - RETURN_THRESHOLD_PCT) / perMin)
      : null;

  const v = Object.fromEntries(stored.rows.map((r) => [r.kind, r.value]));
  const health = [
    { name: "Blade wear", value: v.health_blade ?? null },
    { name: "Drive motors", value: v.health_motors ?? null },
    { name: "Battery health", value: v.health_battery ?? null },
  ].filter((h) => h.value !== null);

  res.json({
    minutes_left: minutesLeft,
    health,
    maintenance_days: v.maintenance_days ?? null,
    anomaly: anomaly.rows[0]
      ? { session_id: anomaly.rows[0].id, obstacles: anomaly.rows[0].obstacles_count }
      : null,
  });
});

router.get("/robots/:id/sessions", async (req, res) => {
  const { rows } = await query(
    `SELECT id, status, area_m2, started_at, ended_at, duration_min,
            battery_start_pct, battery_end_pct, obstacles_count
     FROM mowing_sessions
     WHERE robot_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [req.robotId, limitFrom(req, 20, 200)],
  );
  res.json(rows);
});

router.get("/robots/:id/events", async (req, res) => {
  const { rows } = await query(
    `SELECT id, ts, level, type, message
     FROM events
     WHERE robot_id = $1
     ORDER BY ts DESC
     LIMIT $2`,
    [req.robotId, limitFrom(req, 20, 200)],
  );
  res.json(rows);
});

// Operator -> queue a command for the robot
// NOTE: no login yet. Keep the API on localhost until authentication is added.
router.post("/robots/:id/commands", async (req, res) => {
  const parsed = Command.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid command" });

  const robot = (
    await query("SELECT id FROM robots WHERE id = $1", [req.robotId])
  ).rows[0];
  if (!robot) return res.status(404).json({ error: "robot not found" });

  const type = parsed.data.type;
  const { rows } = await query(
    "INSERT INTO commands(robot_id, type) VALUES ($1, $2) RETURNING id, type, status",
    [req.robotId, type],
  );
  await query(
    "INSERT INTO events(robot_id, level, type, message) VALUES ($1, 'Info', 'command', $2)",
    [req.robotId, `Command sent: ${type}`],
  );
  await query("INSERT INTO audit_log(action, detail) VALUES ('command', $1)", [
    `${type} robot ${req.robotId}`,
  ]);
  res.status(201).json(rows[0]);
});

module.exports = router;
