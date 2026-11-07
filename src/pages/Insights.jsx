function healthClass(value) {
  if (value > 80) return "fill-good";
  if (value > 60) return "fill-warn";
  return "fill-bad";
}

// insights comes from GET /robots/:id/insights (null until it has loaded)
export default function Insights({ insights }) {
  const minutesLeft = insights?.minutes_left ?? null;
  const unusual = insights?.anomaly ?? null;
  const health = insights?.health ?? [];
  const maintenance = insights?.maintenance_days ?? null;
  const weakest = health.length ? health.reduce((a, b) => (b.value < a.value ? b : a)) : null;

  return (
    <div className="page">
      <div className="insights-grid">
        <div className="chart-card">
          <div className="chart-header">
            <h3>Estimated mowing time left</h3>
          </div>
          <p className="big-number">{minutesLeft === null ? "–" : `${minutesLeft} min`}</p>
          <p className="note">
            Until the battery reaches the 20% return threshold, based on the average battery use of
            recent sessions. Rule-based estimate; the AI model will replace it.
          </p>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>Anomaly check</h3>
          </div>
          <p className={unusual ? "big-number status-warn" : "big-number status-ok"}>
            {unusual ? "Check needed" : "All normal"}
          </p>
          <p className="note">
            {unusual
              ? `Session ${unusual.session_id} had ${unusual.obstacles} obstacles, more than usual.`
              : "No unusual behaviour in the last 14 days."}
          </p>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-header">
          <h3>Component health</h3>
        </div>
        {health.map((item) => (
          <div className="health-item" key={item.name}>
            <div className="health-label">
              <span>{item.name}</span>
              <strong>{item.value}%</strong>
            </div>
            <div className="bar">
              <i className={healthClass(item.value)} style={{ width: `${item.value}%` }} />
            </div>
          </div>
        ))}
        {health.length === 0 && <p className="note">No health data yet. Start the AI module (npm run ai).</p>}
        {health.length > 0 && (
          <p className="note">
            {maintenance !== null ? `Next maintenance in about ${maintenance} days. ` : ""}
            {weakest ? `Check the ${weakest.name.toLowerCase()} first. ` : ""}
            Values come from the mock AI module (wear per mowing hour).
          </p>
        )}
      </div>
    </div>
  );
}
