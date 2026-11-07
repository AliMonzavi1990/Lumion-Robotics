import { Battery, Trees, Clock, Wrench } from "lucide-react";

const round1 = (n) => Math.round(n * 10) / 10;
const percentChange = (cur, prev) => (prev > 0 ? round1(((cur - prev) / prev) * 100) : null);

// Builds the four stat cards from backend data. "–" is shown until data arrives.
export function getStats({ status, summary, insights, stateLabel }) {
  const maintenance = insights?.maintenance_days;

  return [
    {
      icon: Battery,
      title: "Battery remaining",
      value: status ? Math.round(status.battery_pct) : "–",
      unit: "%",
      status: stateLabel,
      changePercent: status ? round1(status.battery_change) : null,
    },
    {
      icon: Trees,
      title: "Mowing area",
      value: summary ? Math.round(summary.area_cur) : "–",
      unit: "m²",
      status: "This week",
      changePercent: summary ? percentChange(summary.area_cur, summary.area_prev) : null,
    },
    {
      icon: Clock,
      title: "Operating time",
      value: summary ? round1(summary.duration_cur / 60) : "–",
      unit: "hrs",
      status: "This week",
      changePercent: summary ? percentChange(summary.duration_cur, summary.duration_prev) : null,
    },
    {
      icon: Wrench,
      title: "Next maintenance",
      value: maintenance ?? "–",
      unit: "days",
      status: "Estimated",
      changePercent: null,
    },
  ];
}
