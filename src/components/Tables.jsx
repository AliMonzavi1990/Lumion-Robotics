const statusClass = { Completed: "status-ok", "In progress": "status-info", Aborted: "status-bad" };
const levelClass = { OK: "status-ok", Info: "status-info", Warning: "status-warn" };

export function SessionsTable({ rows, limit, onViewAll, onSelect, selectedId, title = "Latest sessions" }) {
  const shown = limit ? rows.slice(0, limit) : rows;

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>{title}</h3>
        {onViewAll && (
          <button type="button" className="link-btn" onClick={onViewAll}>
            View all
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th>Status</th>
              <th>Area</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.id}
                className={
                  onSelect ? (row.id === selectedId ? "row-select selected" : "row-select") : ""
                }
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? () => onSelect(row.id) : undefined}
                onKeyDown={
                  onSelect ? (e) => e.key === "Enter" && onSelect(row.id) : undefined
                }
              >
                <td>{row.id}</td>
                <td className={statusClass[row.status]}>{row.status}</td>
                <td>{row.area_m2} m²</td>
                <td>{row.date}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4}>No sessions match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EventsTable({ rows, limit }) {
  const shown = limit ? rows.slice(0, limit) : rows;

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>Recent events</h3>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Level</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                <td>{row.message}</td>
                <td className={levelClass[row.level]}>{row.level}</td>
                <td>{row.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
