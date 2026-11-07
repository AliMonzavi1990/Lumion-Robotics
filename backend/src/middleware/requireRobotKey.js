const crypto = require("crypto");
const { query } = require("../db");

// Identifies the robot from the x-api-key header (only a hash is stored)
async function requireRobotKey(req, res, next) {
  const key = req.header("x-api-key");
  if (!key) return res.status(401).json({ error: "missing api key" });

  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const { rows } = await query(
    "SELECT id, name FROM robots WHERE api_key_hash = $1",
    [hash],
  );
  if (!rows[0]) return res.status(401).json({ error: "invalid api key" });

  req.robot = rows[0];
  next();
}

module.exports = requireRobotKey;
