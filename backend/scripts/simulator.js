// Fake robot: sends telemetry every 2 seconds and executes commands.
// Run: npm run sim            (add SIM_BAD=1 to also send invalid data now and then)
require("dotenv").config();

const API = process.env.API_URL || "http://localhost:3000/api";
const KEY = process.env.ROBOT_API_KEY || "dev-robot-key-123";
const ROBOT_ID = Number(process.env.ROBOT_ID || 1);
const TOTAL_AREA = 450;
const BAD = process.env.SIM_BAD === "1";

// Tuned so a full session from 100% completes: 300 ticks x 0.25 = 75% battery
const DRAIN_PER_TICK = 0.25;
const AREA_PER_TICK = 1.5;
const CHARGE_PER_TICK = 1;
const OBSTACLE_CHANCE = 0.005;

const s = { state: "docked", battery: 66, area: 0, ticks: 0, count: 0 };

function call(path, options = {}) {
  return fetch(API + path, {
    ...options,
    headers: { "x-api-key": KEY, "content-type": "application/json" },
  });
}

// Continue from the battery level stored by the seed script (if the API answers)
async function loadStartLevel() {
  try {
    const res = await fetch(`${API}/robots/${ROBOT_ID}/status`);
    if (res.ok) {
      const status = await res.json();
      s.battery = status.battery_pct;
    }
  } catch {
    // the API is not reachable yet; the default level is used
  }
}

async function handleCommand() {
  const res = await call("/robot/commands/next");
  if (!res.ok) return;
  const cmd = await res.json();
  if (!cmd) return;

  console.log("command:", cmd.type);
  if (cmd.type === "start" && s.battery >= 20 && s.state !== "mowing") {
    if (s.state === "docked") s.area = 0; // new session starts from zero
    s.state = "mowing";
  } else if (cmd.type === "pause" && s.state === "mowing") {
    s.state = "paused";
  } else if (cmd.type === "dock" && (s.state === "mowing" || s.state === "paused")) {
    s.state = "returning";
    s.ticks = 0;
  }
  await call(`/robot/commands/${cmd.id}/ack`, { method: "POST" });
}

function step() {
  let obstacle = false;
  if (s.state === "mowing") {
    s.battery -= DRAIN_PER_TICK;
    s.area = Math.min(TOTAL_AREA, s.area + AREA_PER_TICK);
    obstacle = Math.random() < OBSTACLE_CHANCE;
    if (s.battery < 20 || s.area >= TOTAL_AREA) {
      s.state = "returning";
      s.ticks = 0;
    }
  } else if (s.state === "returning") {
    s.battery -= 0.1;
    if (++s.ticks >= 3) s.state = "docked";
  } else if (s.state === "docked") {
    s.battery = Math.min(100, s.battery + CHARGE_PER_TICK);
  }
  s.battery = Math.max(0, Math.min(100, Math.round(s.battery * 10) / 10));
  return obstacle;
}

async function send(obstacle) {
  s.count++;
  const bad = BAD && s.count % 25 === 0;
  const body = {
    battery_pct: bad ? 150 : s.battery,
    state: s.state,
    area_m2: Math.round(s.area * 10) / 10,
  };
  if (obstacle) body.obstacle_detected = true;

  const res = await call("/telemetry", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) console.log("rejected:", res.status, bad ? "(invalid on purpose)" : "");
}

async function loop() {
  try {
    await handleCommand();
    await send(step());
  } catch (err) {
    console.log("tick failed:", err.message);
  }
  setTimeout(loop, 2000);
}

async function main() {
  await loadStartLevel();
  console.log(`Simulator sending to ${API} (start battery ${s.battery}%)`);
  loop();
}

main();
