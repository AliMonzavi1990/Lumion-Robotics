import { Sun, Moon } from "lucide-react";
import { ACTIONS } from "../constants";

// connection: { label, tone } where tone is "live", "wait" or "off"
export default function Header({ title, connection, pendingAction, onAction, theme, onToggleTheme }) {
  const isNight = theme === "dark";
  const ThemeIcon = isNight ? Sun : Moon;

  return (
    <header>
      <h2>{title}</h2>
      <div className="buttons">
        <button type="button" className="sim-chip" aria-live="polite">
          <div className="header-btn-content">
            <div className={connection.tone === "live" ? "dot" : `dot dot-${connection.tone}`}></div>
            <small>{connection.label}</small>
          </div>
        </button>

        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              type="button"
              key={action.name}
              className={pendingAction === action.name ? "active" : ""}
              onClick={() => onAction(action)}
            >
              <div className="header-btn-content">
                <Icon size={action.size} strokeWidth={action.strokeWidth} />
                <p>{action.name}</p>
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isNight ? "Switch to day mode" : "Switch to night mode"}
        >
          <div className="header-btn-content">
            <ThemeIcon size={17} strokeWidth={1.8} />
            <p>{isNight ? "Day" : "Night"}</p>
          </div>
        </button>
      </div>
    </header>
  );
}
