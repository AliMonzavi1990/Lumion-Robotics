export default function StatCard({ icon: Icon, title, value, unit, status, changePercent }) {
  return (
    <div className="stat-card">
      <div className="stat-icon-wrapper">
        <Icon size={20} color="var(--chart-purple)" />
      </div>

      <p>{title}</p>
      <div>
        <h2>
          {value}
          <span className="stat-unit">{unit}</span>
        </h2>
      </div>
      <div className="stat-detail">
        <p>{status}</p>
        {changePercent !== null && changePercent !== 0 && (
          <small
            className={
              changePercent > 0
                ? "change-percent change-percent-plus"
                : "change-percent change-percent-minus"
            }
          >
            {changePercent > 0 ? "↑" : "↓"} {Math.abs(changePercent)}%
          </small>
        )}
      </div>
    </div>
  );
}
