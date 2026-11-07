# Lumion Robotics – Robotic Lawnmower Dashboard

Full-stack prototype for the Modern Management of IT group assignment:
a React dashboard, a Node.js/Express API, a PostgreSQL database, a robot
simulator and a mock AI module.

> The robot is **simulated**. Everything else (API, database, dashboard) is real.
> Nothing in the dashboard is hard-coded any more: all numbers come from the database.

## Requirements

Node.js 20+, Docker Desktop (for PostgreSQL).

## First-time setup

```bash
npm run setup        # installs frontend and backend packages
npm run db:up        # starts PostgreSQL in Docker
npm run db:setup     # creates the tables and fills them with generated demo data
```

## Run (4 terminals, in the project root)

| # | Command       | What it does                                                    |
|---|---------------|-----------------------------------------------------------------|
| 1 | `npm run api` | API on http://localhost:3000                                    |
| 2 | `npm run sim` | Simulated robot: sends telemetry, executes Start/Pause/Dock      |
| 3 | `npm run ai`  | Mock AI: battery forecast, component health, days to maintenance |
| 4 | `npm run dev` | Dashboard on http://localhost:5173                              |

The database must be running (`npm run db:up`). `.env` files are optional: the defaults
match `docker-compose.yml`. Without terminal 2 the dashboard shows "Robot offline" and
the history from the demo data; without terminal 3 the forecast line and health values stop updating.

Check the API: http://localhost:3000/health

## Try it

1. Open the dashboard. It shows 8 weeks of generated history and a robot that is charging (~70%).
2. Press **Start** and confirm. Within 2 seconds the state becomes *Mowing*, the battery drops,
   a new session appears and the events table fills.
3. Press **Pause**, then **Start** again, then **Dock**. Paused time is not counted in the session duration.
4. Let a session finish, then look at the **Sessions** page and the **AI insights** page.
5. Reset the demo data any time with `npm run db:setup`.
6. `SIM_BAD=1 npm run sim` makes the robot send invalid data now and then: the API rejects it and logs a warning event.

## Project structure

```
src/                        React dashboard
  api.js                    the only place that calls fetch (maps API data to what components need)
  hooks/usePolling.js       calls an API function every few seconds
  data/stats.js             builds the four stat cards
  pages/                    Overview, Sessions, Insights
  components/, DashboardCharts.jsx, App.jsx, constants.js
backend/
  server.js                 Express app (CORS, JSON, routes, error handler)
  src/routes/robot.js       robot -> backend (telemetry, commands/next, ack), uses the robot API key
  src/routes/robots.js      dashboard -> backend (status, battery, activity, summary, insights, sessions, events, commands)
  src/insights.js           rule-based component health and maintenance estimate
  src/schemas.js            Zod validation of incoming data
  src/middleware/           robot API key check (only a SHA-256 hash is stored)
  db/init.sql               tables, indexes and CHECK constraints
  scripts/seedData.js       generates the demo data (pure function, tested)
  scripts/seed.js           writes the demo data to PostgreSQL
  scripts/simulator.js      fake robot
  scripts/mockAi.js         stand-in for the AI module
  test/                     tests for the generated data (npm test)
docker-compose.yml          PostgreSQL 16
docs/PRESENTATION_FA.md     explanation for the presentation (Persian)
```

## API

Robot (header `x-api-key`):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/telemetry` | one measurement: `battery_pct`, `state`, `area_m2`, optional `lat`, `lng`, `obstacle_detected` |
| GET  | `/api/robot/commands/next` | next queued command or `null` (commands older than 2 min expire) |
| POST | `/api/robot/commands/:id/ack` | command executed |

Dashboard:

| Method | Path | Used by |
|---|---|---|
| GET  | `/api/robots/1/status` | battery card, connection chip |
| GET  | `/api/robots/1/summary` | area and operating-time cards |
| GET  | `/api/robots/1/battery?range=live\|day` | battery chart (actual + AI forecast) |
| GET  | `/api/robots/1/activity?range=week\|month` | mowing and charging chart |
| GET  | `/api/robots/1/sessions?limit=` | sessions tables |
| GET  | `/api/robots/1/events?limit=` | events tables |
| GET  | `/api/robots/1/insights` | AI insights page, maintenance card |
| POST | `/api/robots/1/commands` | Start / Pause / Dock buttons |

## Demo data

`npm run db:setup` generates the same data every time: 39 sessions over 8 weeks
(3 aborted, one with 5 obstacles), 24 hours of battery samples, AI forecasts, events
(obstacles, docking, maintenance), and one finished session 22 minutes ago with the robot
charging. Sessions, telemetry and events are consistent with each other.

## Definitions used in the data

- `duration_min` = active mowing time. Pauses and docking are not counted.
- `charging_min` = time on the dock while the battery is below 100%.
- A session is **Completed** if it covered at least 95% of the lawn, otherwise **Aborted**.
- Component health and "days to maintenance" are simple wear rules per mowing hour. They are a
  placeholder for the real AI model.
- Day boundaries in the charts follow the database timezone (`DB_TIMEZONE`, see `docker-compose.yml`).

## Known limitations

- No login yet: anyone who can reach the API can send commands. Keep it on localhost.
  The `users` table is prepared for a future login (JWT).
- One robot (id 1) is shown in the dashboard.
- Polling every few seconds instead of WebSockets.
- The mower's telemetry and predictions tables grow without limit; a real system needs retention.
