import { LayoutGrid, List, Sparkles, Play, Pause, HousePlug } from "lucide-react";

// Chart colours. They point to the CSS variables in index.css,
// so the charts follow the Day/Night theme automatically.
export const COLORS = {
  mowing: "var(--chart-purple)",
  charging: "var(--chart-orange)",
  grid: "var(--border)",
  axis: "var(--text)",
  tooltipBg: "var(--card)",
  tooltipText: "var(--text-h)",
};

// Sidebar pages
export const PAGES = [
  { content: "Overview", icon: LayoutGrid },
  { content: "Sessions", icon: List },
  { content: "AI insights", icon: Sparkles },
];

// Operator commands. "type" is what the backend expects.
// Each one asks for confirmation before it is sent.
export const ACTIONS = [
  { name: "Start", type: "start", icon: Play, strokeWidth: 1.8, size: 17, question: "Start a mowing session?" },
  { name: "Pause", type: "pause", icon: Pause, strokeWidth: 1.5, size: 17, question: "Pause the mower now?" },
  { name: "Dock", type: "dock", icon: HousePlug, strokeWidth: 1.8, size: 18, question: "Send the mower back to its dock?" },
];

// Robot state from the API -> label shown in the dashboard
export const STATE_LABELS = {
  mowing: "Mowing",
  paused: "Paused",
  returning: "Returning",
  docked: "Docked",
};
