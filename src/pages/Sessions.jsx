import { useState } from "react";
import { SessionsTable, EventsTable } from "../components/Tables";

const FILTERS = ["All", "Completed", "In progress", "Aborted"];

export default function Sessions({ sessions, events }) {
  const [filter, setFilter] = useState("All");
  const [selectedId, setSelectedId] = useState(null);

  const rows = filter === "All" ? sessions : sessions.filter((s) => s.status === filter);
  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0];

  const details = selected
    ? [
        ["Status", selected.status],
        ["Area", `${selected.area_m2} m²`],
        ["Duration", `${selected.duration_min} min`],
        ["Battery", `${selected.battery_start_pct}% → ${selected.battery_end_pct}%`],
        ["Obstacles", selected.obstacles],
        ["Date", selected.date],
      ]
    : [];

  return (
    <div className="page">
      <div className="chart-card">
        <div className="chart-header">
          <h3>{selected ? selected.id : "No sessions yet"}</h3>
        </div>
        <div className="detail-grid">
          {details.map(([label, value]) => (
            <div key={label}>
              <p>{label}</p>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="filter-row">
          <label htmlFor="session-filter">Status</label>
          <select id="session-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <SessionsTable
          title="Mowing sessions"
          rows={rows}
          selectedId={selected?.id}
          onSelect={setSelectedId}
        />
      </div>

      <EventsTable rows={events} />
    </div>
  );
}
