const { z } = require("zod");

// Data contract for one telemetry message from the mower
const Telemetry = z.object({
  battery_pct: z.number().min(0).max(100),
  state: z.enum(["mowing", "paused", "returning", "docked"]),
  area_m2: z.number().min(0).max(100000),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  obstacle_detected: z.boolean().optional(),
});

// Commands an operator can send
const Command = z.object({
  type: z.enum(["start", "pause", "dock"]),
});

module.exports = { Telemetry, Command };
