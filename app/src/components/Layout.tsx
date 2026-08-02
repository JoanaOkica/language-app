import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";

const TABS = [
  { to: "/", icon: "🏠", label: "Home" },
  { to: "/library", icon: "📚", label: "Library" },
  { to: "/fred", icon: "🎙️", label: "FRED" },
  { to: "/friends", icon: "👥", label: "Friends" },
  { to: "/challenges", icon: "⚔️", label: "Compete" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { stats } = useSession();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">🦌 Linguafox</div>
        <div className="stats">
          <span className="pill">🔥 {stats?.streak_current ?? 0}</span>
          <span className="pill">⭐ {stats?.star_points ?? 0}</span>
          <button className="pill" style={{ border: "none", cursor: "pointer" }}
                  onClick={() => navigate("/settings")} aria-label="Settings">⚙️</button>
        </div>
      </header>

      <main className="content">{children}</main>

      <nav className="tabs">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === "/"}
                   className={({ isActive }) => (isActive ? "on" : "")}>
            <span className="ico">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
