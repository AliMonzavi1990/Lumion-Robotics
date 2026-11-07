// Run: npm test   (uses the built-in Node test runner, no extra packages)
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDataset, TOTAL_AREA_M2 } = require("../scripts/seedData");

const now = Date.UTC(2026, 10, 6, 12, 0, 0);
const data = buildDataset(now);

test("same input gives the same data", () => {
  assert.deepEqual(buildDataset(now), data);
});

test("battery values stay between 0 and 100", () => {
  for (const t of data.telemetry) assert.ok(t.battery >= 0 && t.battery <= 100, `bad battery ${t.battery}`);
  for (const f of data.forecasts) assert.ok(f.value >= 0 && f.value <= 100);
  for (const s of data.sessions) {
    assert.ok(s.batteryStart >= 0 && s.batteryStart <= 100);
    assert.ok(s.batteryEnd >= 0 && s.batteryEnd <= 100);
  }
});

test("nothing is in the future and every value is valid", () => {
  for (const s of data.sessions) assert.ok(s.end <= now && s.start < s.end);
  for (const t of data.telemetry) assert.ok(t.ts <= now);
  for (const e of data.events) assert.ok(e.ts <= now);
  for (const t of data.telemetry) assert.ok(["mowing", "paused", "returning", "docked"].includes(t.state));
});

test("sessions do not overlap and status matches the 95% rule", () => {
  const sorted = [...data.sessions].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].start >= sorted[i - 1].end);
  for (const s of data.sessions) {
    assert.ok(s.area <= TOTAL_AREA_M2);
    assert.equal(s.status === "Completed", s.area >= 0.95 * TOTAL_AREA_M2);
  }
});

test("covers about 8 weeks and has an unusual (5 obstacle) session in the last 14 days", () => {
  const first = Math.min(...data.sessions.map((s) => s.start));
  assert.ok(now - first > 55 * 24 * 3600e3);
  const recent = data.sessions.filter((s) => s.start > now - 14 * 24 * 3600e3 && s.obstacles >= 5);
  assert.equal(recent.length, 1);
});

test("the story ends with a docked, charging robot", () => {
  const last = data.telemetry[data.telemetry.length - 1];
  assert.equal(last.state, "docked");
  assert.ok(last.battery > 60 && last.battery < 100);
  assert.equal(now - last.ts, 0);
});
