import StatCard from "../components/StatCard";
import DashboardCharts from "../DashboardCharts";
import { SessionsTable, EventsTable } from "../components/Tables";

export default function Overview({ stats, sessions, events, onViewSessions }) {
  return (
    <>
      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      <DashboardCharts />

      <div className="tables-grid">
        <SessionsTable rows={sessions} limit={4} onViewAll={onViewSessions} />
        <EventsTable rows={events} limit={5} />
      </div>
    </>
  );
}
