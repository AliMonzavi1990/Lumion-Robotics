// Stand-in for the AI module. It reads recent battery samples from the
// database and writes into the predictions table:
//   - a simple battery forecast every 2 seconds (while the robot is online)
//   - component health and days to maintenance every 30 seconds
// The real AI/DA model would replace this script. Run: npm run ai
const { query } = require("../src/db");
const { computeHealth, saveHealth } = require("../src/insights");

const ROBOT_ID = Number(process.env.ROBOT_ID || 1);
const HEALTH_EVERY_TICKS = 15; // 15 x 2 s = 30 s
const STALE_AFTER_MS = 15000;

let ticks = 0;

async function forecastBattery() {
  const { rows } = await query(
    "SELECT ts, battery_pct FROM telemetry_samples WHERE robot_id = $1 ORDER BY ts DESC LIMIT 10",
    [ROBOT_ID],
  );
  if (rows.length < 3) return;

  // No new data (robot offline): do not keep writing forecasts
  if (Date.now() - new Date(rows[0].ts).getTime() > STALE_AFTER_MS) return;

  // Straight line through the last samples, projected 5 steps ahead
  const y = rows.map((r) => r.battery_pct).reverse();
  const n = y.length;
  const xMean = (n - 1) / 2;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  y.forEach((v, i) => {
    num += (i - xMean) * (v - yMean);
    den += (i - xMean) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const forecast = Math.max(0, Math.min(100, y[n - 1] + slope * 5));

  await query(
    "INSERT INTO predictions(robot_id, kind, value) VALUES ($1, 'battery_forecast', $2)",
    [ROBOT_ID, forecast],
  );
}

async function tick() {
  await forecastBattery();
  if (ticks % HEALTH_EVERY_TICKS === 0) {
    await saveHealth(ROBOT_ID, await computeHealth(ROBOT_ID));
  }
  ticks++;
}

async function loop() {
  try {
    await tick();
  } catch (err) {
    console.log("AI tick failed:", err.message);
  }
  setTimeout(loop, 2000);
}

console.log("Mock AI writing battery forecasts and component health");
loop();
