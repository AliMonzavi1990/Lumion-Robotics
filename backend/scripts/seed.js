// Adds the demo robot and generated history: npm run db:seed
// WARNING: running it again resets ALL demo data (sessions, telemetry,
// events, commands, predictions) and starts the ids from 1 again.
const crypto = require("crypto");
const { pool } = require("../src/db");
const { computeHealth, saveHealth } = require("../src/insights");
const { buildDataset, TOTAL_AREA_M2 } = require("./seedData");

const KEY = process.env.ROBOT_API_KEY || "dev-robot-key-123";
const hash = crypto.createHash("sha256").update(KEY).digest("hex");
const at = (ms) => new Date(ms).toISOString();

async function main() {
  const data = buildDataset(Date.now());
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const robot = await client.query(
      `INSERT INTO robots(name, api_key_hash, total_area_m2) VALUES ('LM-001', $1, $2)
       ON CONFLICT (name) DO UPDATE SET api_key_hash = EXCLUDED.api_key_hash,
                                        total_area_m2 = EXCLUDED.total_area_m2
       RETURNING id`,
      [hash, TOTAL_AREA_M2],
    );
    const id = robot.rows[0].id;

    await client.query(
      `TRUNCATE predictions, events, telemetry_samples, commands, mowing_sessions RESTART IDENTITY`,
    );
    await client.query("DELETE FROM audit_log");

    for (const s of data.sessions) {
      await client.query(
        `INSERT INTO mowing_sessions(
           robot_id, started_at, ended_at, status, area_m2, duration_min,
           charging_min, battery_start_pct, battery_end_pct, obstacles_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, at(s.start), at(s.end), s.status, s.area, s.duration, s.charging, s.batteryStart, s.batteryEnd, s.obstacles],
      );
    }

    // Telemetry and forecasts in one statement each (arrays are unnested)
    await client.query(
      `INSERT INTO telemetry_samples(robot_id, ts, battery_pct, state, area_m2)
       SELECT $1::int, t.ts, t.battery, t.state, t.area
       FROM unnest($2::timestamptz[], $3::real[], $4::text[], $5::real[]) AS t(ts, battery, state, area)`,
      [
        id,
        data.telemetry.map((t) => at(t.ts)),
        data.telemetry.map((t) => t.battery),
        data.telemetry.map((t) => t.state),
        data.telemetry.map((t) => t.area),
      ],
    );
    await client.query(
      `INSERT INTO predictions(robot_id, ts, kind, value)
       SELECT $1::int, f.ts, 'battery_forecast', f.value
       FROM unnest($2::timestamptz[], $3::real[]) AS f(ts, value)`,
      [id, data.forecasts.map((f) => at(f.ts)), data.forecasts.map((f) => f.value)],
    );

    for (const e of data.events) {
      await client.query(
        "INSERT INTO events(robot_id, ts, level, type, message) VALUES ($1, $2, $3, $4, $5)",
        [id, at(e.ts), e.level, e.type, e.message],
      );
    }
    for (const c of data.commands) {
      await client.query(
        "INSERT INTO commands(robot_id, type, status, created_at) VALUES ($1, $2, 'done', $3)",
        [id, c.type, at(c.ts)],
      );
      await client.query(
        "INSERT INTO events(robot_id, ts, level, type, message) VALUES ($1, $2, 'Info', 'command', $3)",
        [id, at(c.ts), `Command sent: ${c.type}`],
      );
      await client.query("INSERT INTO audit_log(ts, action, detail) VALUES ($1, 'command', $2)", [
        at(c.ts),
        `${c.type} robot ${id}`,
      ]);
    }

    await client.query("UPDATE robots SET last_seen_at = now() WHERE id = $1", [id]);
    await client.query("COMMIT");

    // Health numbers are calculated from the sessions that were just saved
    await saveHealth(id, await computeHealth(id));

    console.log(
      `Seeded robot LM-001 (id ${id}): ${data.sessions.length} sessions, ` +
        `${data.telemetry.length} telemetry samples, ${data.events.length} events.`,
    );
    console.log(`Robot API key: ${KEY}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
