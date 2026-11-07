import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import Header from "./components/Header";
import ConfirmDialog from "./components/ConfirmDialog";
import Overview from "./pages/Overview";
import Sessions from "./pages/Sessions";
import Insights from "./pages/Insights";
import { usePolling } from "./hooks/usePolling";
import {
  getStatus,
  getSummary,
  getSessions,
  getEvents,
  getInsights,
  sendCommand,
} from "./api";
import { getStats } from "./data/stats";
import { PAGES, STATE_LABELS } from "./constants";

import "./App.css";
import "./Pages.css";

const THEME_KEY = "lumion-theme";

// Night ("dark") is the default theme. Day is "light".
function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function App() {
  const [page, setPage] = useState("Overview");
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage can be blocked; the theme still works for this visit
    }
  }, [theme]);

  return (
    <main className="dashboard">
      <Sidebar page={page} onSelect={setPage} />
      <Content
        page={page}
        setPage={setPage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
    </main>
  );
}

function Sidebar({ page, onSelect }) {
  return (
    <aside>
      <div className="logo-container">
        <img src="Favicon.svg" />
        <p className="logo">Lumion</p>
      </div>
      <nav>
        {PAGES.map((item) => (
          <SideItem
            key={item.content}
            content={item.content}
            icon={item.icon}
            activeItem={page}
            onSelect={onSelect}
          />
        ))}
      </nav>
    </aside>
  );
}

function SideItem({ content, icon: Icon, activeItem, onSelect }) {
  const isActive = activeItem === content;

  return (
    <button
      type="button"
      className={isActive ? "side-sec active" : "side-sec"}
      aria-current={isActive ? "page" : undefined}
      onClick={() => onSelect(content)}
    >
      <div className="content-icon">
        <Icon size={19} strokeWidth={1.8} />
        <p>{content}</p>
      </div>

      <ChevronRight size={17} strokeWidth={1.8} color="var(--text)" />
    </button>
  );
}

// Text and colour of the connection chip in the header
function getConnection(status) {
  if (status.error?.status === 404)
    return { label: "No data yet", tone: "wait" };
  if (status.error) return { label: "Server offline", tone: "off" };
  if (status.loading) return { label: "Connecting…", tone: "wait" };
  if (status.data?.online) return { label: "Live data", tone: "live" };
  return { label: "Robot offline", tone: "off" };
}

function Content({ page, setPage, theme, onToggleTheme }) {
  // Data from the backend, refreshed every few seconds
  const status = usePolling(getStatus, 2000);
  const events = usePolling(getEvents, 3000);
  const sessions = usePolling(getSessions, 5000);
  const summary = usePolling(getSummary, 10000);
  const insights = usePolling(getInsights, 5000);

  const [pending, setPending] = useState(null); // command waiting for confirmation
  const [notice, setNotice] = useState(null); // short message after a command

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function confirmAction() {
    const action = pending;
    setPending(null);
    try {
      await sendCommand(action.type);
      // A command waits 2 minutes for the robot; after that it expires
      if (status.data?.online) {
        setNotice({ type: "ok", text: `${action.name} command sent` });
      } else {
        setNotice({
          type: "error",
          text: `${action.name} queued, but the robot is offline (expires in 2 min)`,
        });
      }
    } catch {
      setNotice({
        type: "error",
        text: `Could not send the ${action.name} command`,
      });
    }
  }

  const stateLabel = STATE_LABELS[status.data?.state] ?? "Unknown";
  const stats = getStats({
    status: status.data,
    summary: summary.data,
    insights: insights.data,
    stateLabel,
  });
  const sessionRows = sessions.data ?? [];
  const eventRows = events.data ?? [];

  return (
    <div className="main">
      <Header
        title={page}
        connection={getConnection(status)}
        pendingAction={pending?.name}
        onAction={setPending}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {pending && (
        <ConfirmDialog
          question={pending.question}
          onConfirm={confirmAction}
          onCancel={() => setPending(null)}
        />
      )}

      {notice && (
        <div
          className={notice.type === "error" ? "toast toast-error" : "toast"}
          role="status"
        >
          {notice.text}
        </div>
      )}

      {page === "Overview" && (
        <Overview
          stats={stats}
          sessions={sessionRows}
          events={eventRows}
          onViewSessions={() => setPage("Sessions")}
        />
      )}
      {page === "Sessions" && (
        <Sessions sessions={sessionRows} events={eventRows} />
      )}
      {page === "AI insights" && <Insights insights={insights.data} />}
    </div>
  );
}
