-- Lumion Robotics database schema (safe to run more than once)
-- CHECK constraints protect the data even if the API validation is bypassed.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('operator', 'admin'))
);

CREATE TABLE IF NOT EXISTS robots (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  api_key_hash TEXT NOT NULL,
  total_area_m2 REAL NOT NULL DEFAULT 450 CHECK (total_area_m2 > 0),
  last_seen_at TIMESTAMPTZ
);

-- duration_min = active mowing time (pauses and docking are NOT counted)
-- charging_min = time spent docked below 100% after the session
CREATE TABLE IF NOT EXISTS mowing_sessions (
  id SERIAL PRIMARY KEY,
  robot_id INT NOT NULL REFERENCES robots(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'In progress'
    CHECK (status IN ('In progress', 'Completed', 'Aborted')),
  area_m2 REAL NOT NULL DEFAULT 0 CHECK (area_m2 >= 0),
  duration_min REAL NOT NULL DEFAULT 0 CHECK (duration_min >= 0),
  charging_min REAL NOT NULL DEFAULT 0 CHECK (charging_min >= 0),
  battery_start_pct REAL NOT NULL CHECK (battery_start_pct BETWEEN 0 AND 100),
  battery_end_pct REAL NOT NULL CHECK (battery_end_pct BETWEEN 0 AND 100),
  obstacles_count INT NOT NULL DEFAULT 0 CHECK (obstacles_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_sessions_robot_started ON mowing_sessions (robot_id, started_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_samples (
  id BIGSERIAL PRIMARY KEY,
  robot_id INT NOT NULL REFERENCES robots(id),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  battery_pct REAL NOT NULL CHECK (battery_pct BETWEEN 0 AND 100),
  state TEXT NOT NULL CHECK (state IN ('mowing', 'paused', 'returning', 'docked')),
  area_m2 REAL NOT NULL CHECK (area_m2 >= 0),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_tel_robot_ts ON telemetry_samples (robot_id, ts DESC);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  robot_id INT REFERENCES robots(id),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL DEFAULT 'Info' CHECK (level IN ('OK', 'Info', 'Warning')),
  type TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_robot_ts ON events (robot_id, ts DESC);

-- A queued command that is not picked up within 2 minutes becomes 'expired'
CREATE TABLE IF NOT EXISTS commands (
  id SERIAL PRIMARY KEY,
  robot_id INT NOT NULL REFERENCES robots(id),
  type TEXT NOT NULL CHECK (type IN ('start', 'pause', 'dock')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'done', 'expired')),
  requested_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Output of the AI module. kind is one of:
--   battery_forecast, health_blade, health_motors, health_battery, maintenance_days
CREATE TABLE IF NOT EXISTS predictions (
  id BIGSERIAL PRIMARY KEY,
  robot_id INT NOT NULL REFERENCES robots(id),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL,
  value REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pred_robot_kind_ts ON predictions (robot_id, kind, ts DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INT REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT
);
