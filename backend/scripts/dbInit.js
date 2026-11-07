// Creates the tables: npm run db:init
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "../db/init.sql"), "utf8");
  await pool.query(sql);
  console.log("Database tables are ready.");
}

main()
  .catch((err) => {
    console.error("Could not create the tables:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
