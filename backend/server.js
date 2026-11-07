require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { query } = require("./src/db");
const robotRoutes = require("./src/routes/robot");
const robotsRoutes = require("./src/routes/robots");

const app = express();
const PORT = process.env.PORT || 3000;

// Development: allow the Vite dev server on any localhost port
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: "10kb" }));

app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, database: true });
  } catch {
    res.status(503).json({ ok: false, database: false });
  }
});

app.use("/api", robotRoutes);
app.use("/api", robotsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  const known = err.status && err.status < 500;
  res.status(known ? err.status : 500).json({ error: known ? err.message : "internal error" });
});

app.listen(PORT, () => {
  console.log(`Lumion API running at http://localhost:${PORT}`);
});
