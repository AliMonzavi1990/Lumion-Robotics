// Simple rule-based "AI" numbers: component health and next maintenance.
// The real AI module would replace computeHealth(). Both the seed script and
// mockAi.js use it, and the results are stored in the predictions table.
const { query } = require("./db");

const BLADE_WEAR_PER_HOUR = 0.55; // % lost per hour of mowing
const MOTOR_WEAR_PER_HOUR = 0.15;
const BATTERY_WEAR_PER_SESSION = 0.4;
const BLADE_SERVICE_LEVEL = 65; // maintenance is due when the blade reaches this

const HEALTH_KINDS = ["health_blade", "health_motors", "health_battery", "maintenance_days"];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

async function computeHealth(robotId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(duration_min), 0)::float8 / 60 AS hours_total,
            COUNT(*)::int AS sessions,
            COALESCE(SUM(duration_min) FILTER (WHERE started_at >= now() - interval '28 days'), 0)::float8
              / 60 / 28 AS hours_per_day
     FROM mowing_sessions
     WHERE robot_id = $1`,
    [robotId],
  );
  const t = rows[0];

  const blade = clamp(100 - t.hours_total * BLADE_WEAR_PER_HOUR, 0, 100);
  const motors = clamp(100 - t.hours_total * MOTOR_WEAR_PER_HOUR, 0, 100);
  const battery = clamp(100 - t.sessions * BATTERY_WEAR_PER_SESSION, 0, 100);

  // Days until the blade reaches the service level at the recent usage rate
  const hoursLeft = Math.max(0, blade - BLADE_SERVICE_LEVEL) / BLADE_WEAR_PER_HOUR;
  const perDay = Math.max(t.hours_per_day, 0.25);
  const maintenanceDays = Math.round(hoursLeft / perDay);

  return {
    health_blade: Math.round(blade),
    health_motors: Math.round(motors),
    health_battery: Math.round(battery),
    maintenance_days: maintenanceDays,
  };
}

async function saveHealth(robotId, values) {
  for (const kind of HEALTH_KINDS) {
    await query("INSERT INTO predictions(robot_id, kind, value) VALUES ($1, $2, $3)", [
      robotId,
      kind,
      values[kind],
    ]);
  }
}

module.exports = { computeHealth, saveHealth, HEALTH_KINDS };
