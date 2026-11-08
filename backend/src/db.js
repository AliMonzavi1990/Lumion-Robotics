require("dotenv").config();
const { Pool } = require("pg");

// Same default as docker-compose.yml, so no .env file is needed locally.
const DEFAULT_URL = "postgres://lumion:lumion_dev@localhost:15432/lumion";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || DEFAULT_URL,
});

// Only this file talks to the database driver. Routes call query().
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
