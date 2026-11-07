// Routes used by the robot itself (authenticated with the robot API key)
const { Router } = require("express");
const { query } = require("../db");
const { Telemetry } = require("../schemas");
const requireRobotKey = require("../middleware/requireRobotKey");

const router = Router();

const STATE_EVENTS = {
  mowing: ["OK", "Mowing started"],
  paused: ["Info", "Mower paused"],
  returning: ["Info", "Returning to dock"],
  docked: ["Info", "Mower docked, charging"],
};

// If two samples are further apart than this, the gap is not counted as work
const MAX_GAP_MIN = 1;
// A command that waits longer than this is not sent to the robot any more
const COMMAND_TTL = "2 minutes";

function addEvent(robotId, level, type, message) {
  return query(
    "INSERT INTO events(robot_id, level, type, message) VALUES ($1, $2, $3, $4)",
    [robotId, level, type, message],
  );
}

// Keeps the mowing_sessions table in step with the telemetry.
// prev = the previous telemetry sample (ts, state, battery_pct) or undefined.
//
// duration_min counts ACTIVE mowing only: the time between two samples is added
// when the previous sample was "mowing". Pauses and docking are not counted.
async function updateSession(robotId, d, prev) {
  const gapMin = prev ? (Date.now() - new Date(prev.ts).getTime()) / 60000 : 0;
  const activeMin = prev?.state === "mowing" ? Math.min(gapMin, MAX_GAP_MIN) : 0;
  const obstacle = d.obstacle_detected ? 1 : 0;

  const open = (
    await query(
      "SELECT id FROM mowing_sessions WHERE robot_id = $1 AND ended_at IS NULL ORDER BY id DESC LIMIT 1",
      [robotId],
    )
  ).rows[0];

  if (d.state === "mowing" || d.state === "paused") {
    if (!open) {
      if (d.state === "mowing") {
        await query(
          `INSERT INTO mowing_sessions(robot_id, area_m2, battery_start_pct, battery_end_pct, obstacles_count)
           VALUES ($1, $2, $3, $4, $5)`,
          [robotId, d.area_m2, d.battery_pct, d.battery_pct, obstacle],
        );
      }
      return;
    }
    await query(
      `UPDATE mowing_sessions
       SET area_m2 = $2, battery_end_pct = $3,
           obstacles_count = obstacles_count + $4,
           duration_min = duration_min + $5
       WHERE id = $1`,
      [open.id, d.area_m2, d.battery_pct, obstacle, activeMin],
    );
    return;
  }

  // returning or docked: close the open session
  if (open) {
    const total = (
      await query("SELECT total_area_m2 FROM robots WHERE id = $1", [robotId])
    ).rows[0].total_area_m2;
    const status = d.area_m2 >= 0.95 * total ? "Completed" : "Aborted";
    await query(
      `UPDATE mowing_sessions
       SET ended_at = now(), area_m2 = $2, battery_end_pct = $3,
           obstacles_count = obstacles_count + $4, status = $5,
           duration_min = duration_min + $6
       WHERE id = $1`,
      [open.id, d.area_m2, d.battery_pct, obstacle, status, activeMin],
    );
  }

  // Charging time: only while the battery is below 100% (a full robot that
  // stays on the dock for hours does not add charging time).
  if (d.state === "docked" && prev && prev.state !== "mowing" && prev.state !== "paused" && prev.battery_pct < 100) {
    await query(
      `UPDATE mowing_sessions
       SET charging_min = charging_min + $2
       WHERE id = (
         SELECT id FROM mowing_sessions
         WHERE robot_id = $1 AND ended_at IS NOT NULL
           AND ended_at > now() - interval '6 hours'
         ORDER BY ended_at DESC LIMIT 1
       )`,
      [robotId, Math.min(gapMin, MAX_GAP_MIN)],
    );
  }
}

// Robot -> backend: one measurement
router.post("/telemetry", requireRobotKey, async (req, res) => {
  const robotId = req.robot.id;
  const parsed = Telemetry.safeParse(req.body);

  if (!parsed.success) {
    await addEvent(
      robotId,
      "Warning",
      "invalid_payload",
      "Rejected telemetry: " + JSON.stringify(parsed.error.issues).slice(0, 300),
    );
    return res.status(400).json({ error: "invalid payload", issues: parsed.error.issues });
  }

  const d = parsed.data;
  const prev = (
    await query(
      "SELECT ts, state, battery_pct FROM telemetry_samples WHERE robot_id = $1 ORDER BY ts DESC LIMIT 1",
      [robotId],
    )
  ).rows[0];

  await query(
    `INSERT INTO telemetry_samples(robot_id, battery_pct, state, area_m2, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [robotId, d.battery_pct, d.state, d.area_m2, d.lat ?? null, d.lng ?? null],
  );
  await query("UPDATE robots SET last_seen_at = now() WHERE id = $1", [robotId]);
  await updateSession(robotId, d, prev);

  if (d.obstacle_detected) {
    await addEvent(robotId, "Warning", "obstacle", "Obstacle detected, path adjusted");
  }
  if (prev && prev.state !== d.state) {
    if (prev.state === "mowing" && d.state === "returning" && d.battery_pct < 20) {
      await addEvent(robotId, "Warning", "low_battery", "Low battery, returning to dock");
    } else {
      const [level, message] = STATE_EVENTS[d.state];
      await addEvent(robotId, level, "state", message);
    }
  }

  res.status(201).end();
});

// Robot -> backend: fetch the next queued command (or null)
router.get("/robot/commands/next", requireRobotKey, async (req, res) => {
  // Old commands are dropped, so a robot that was offline does not suddenly
  // run a command that someone sent minutes ago.
  await query(
    `UPDATE commands SET status = 'expired'
     WHERE robot_id = $1 AND status = 'queued' AND created_at < now() - interval '${COMMAND_TTL}'`,
    [req.robot.id],
  );
  const { rows } = await query(
    `UPDATE commands SET status = 'sent'
     WHERE id = (
       SELECT id FROM commands
       WHERE robot_id = $1 AND status = 'queued'
       ORDER BY id LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, type`,
    [req.robot.id],
  );
  res.json(rows[0] ?? null);
});

// Robot -> backend: command executed
router.post("/robot/commands/:cid/ack", requireRobotKey, async (req, res) => {
  const cid = Number(req.params.cid);
  if (!Number.isInteger(cid) || cid < 1) {
    return res.status(400).json({ error: "invalid command id" });
  }
  await query(
    "UPDATE commands SET status = 'done' WHERE id = $1 AND robot_id = $2",
    [cid, req.robot.id],
  );
  res.status(204).end();
});

module.exports = router;
