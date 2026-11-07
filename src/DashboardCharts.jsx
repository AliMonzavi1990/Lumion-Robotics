import { useMemo, useState } from "react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import { COLORS } from "./constants";
import { usePolling } from "./hooks/usePolling";
import { getActivity, getBattery } from "./api";
import "./DashboardCharts.css";

const tooltipStyle = {
  backgroundColor: COLORS.tooltipBg,
  border: `1px solid ${COLORS.grid}`,
  borderRadius: "10px",
  color: COLORS.tooltipText,
};

const axisTick = { fill: COLORS.axis, fontSize: 12 };

const formatTime = (value, withSeconds) =>
  new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });

export default function DashboardCharts() {
  const [period, setPeriod] = useState("week");
  const [batteryPeriod, setBatteryPeriod] = useState("live");

  // Data from the backend. useMemo keeps the fetcher stable until the range changes.
  const activityFetcher = useMemo(() => () => getActivity(period), [period]);
  const batteryFetcher = useMemo(() => () => getBattery(batteryPeriod), [batteryPeriod]);
  const activity = usePolling(activityFetcher, 30000);
  const battery = usePolling(batteryFetcher, batteryPeriod === "live" ? 2000 : 30000);

  const mowingData = activity.data ?? [];
  const batteryData = battery.data ?? [];

  return (
    <section className="charts-grid">
      {/* Mowing and charging chart */}
      <div className="chart-card">
        <div className="chart-header">
          <h3>Mowing and charging time</h3>

          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Time range"
          >
            <option value="week">This week</option>
            <option value="month">8 weeks</option>
          </select>
        </div>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={mowingData}
              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 4"
                vertical={false}
                stroke={COLORS.grid}
              />

              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={axisTick}
              />

              <YAxis axisLine={false} tickLine={false} tick={axisTick} />

              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [`${value} min`, name]}
              />

              <Bar
                dataKey="mowing"
                name="Mowing"
                stackId="activity"
                fill={COLORS.mowing}
                radius={[0, 0, 4, 4]}
              />

              <Bar
                dataKey="charging"
                name="Charging"
                stackId="activity"
                fill={COLORS.charging}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-legend">
          <span>
            <i className="legend-mowing"></i>
            Mowing
          </span>

          <span>
            <i className="legend-charging"></i>
            Charging
          </span>
        </div>
        {activity.error && <p className="note">Cannot load data. Is the backend running?</p>}
      </div>

      {/* Battery level chart */}
      <div className="chart-card">
        <div className="chart-header">
          <h3>Battery level</h3>

          <select
            value={batteryPeriod}
            onChange={(e) => setBatteryPeriod(e.target.value)}
            aria-label="Time range"
          >
            <option value="live">Live</option>
            <option value="day">Last 24 h</option>
          </select>
        </div>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={batteryData}
              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
            >
              <CartesianGrid stroke={COLORS.grid} vertical={false} />

              <XAxis
                dataKey="ts"
                axisLine={false}
                tickLine={false}
                tick={axisTick}
                tickFormatter={(value, index) => {
                  if (batteryPeriod === "live") {
                    if (index === 0) return formatTime(value, true);
                    if (index === batteryData.length - 1) return "Now";
                    return "";
                  }
                  return index % 4 === 0 ? formatTime(value, false) : "";
                }}
                interval={0}
              />

              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                axisLine={false}
                tickLine={false}
                tick={axisTick}
              />

              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(value) => formatTime(value, true)}
                formatter={(value, name) => [
                  `${Number(value).toFixed(1)}%`,
                  name === "actual" ? "Actual" : "AI predicted",
                ]}
              />

              <Line
                type="monotone"
                dataKey="actual"
                name="actual"
                stroke={COLORS.mowing}
                strokeWidth={2.5}
                connectNulls
                dot={false}
                activeDot={{ r: 5 }}
              />

              <Line
                type="monotone"
                dataKey="predicted"
                name="predicted"
                stroke={COLORS.charging}
                strokeWidth={2}
                strokeDasharray="5 4"
                connectNulls
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-legend">
          <span>
            <i className="legend-actual"></i>
            Actual
          </span>

          <span>
            <i className="legend-predicted"></i>
            AI predicted
          </span>
        </div>
        {battery.error && <p className="note">Cannot load data. Is the backend running?</p>}
      </div>
    </section>
  );
}
