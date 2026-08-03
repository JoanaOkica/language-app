import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { avatarEmoji } from "../lib/types";

const TABS = [
  { to: "/", icon: "🏠", label: "Today" },
  { to: "/plan", icon: "📝", label: "Plan" },
  { to: "/talk", icon: "💬", label: "Talk" },
  { to: "/games", icon: "🎮", label: "Games" },
  { to: "/friends", icon: "👥", label: "Friends" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, stats } = useSession();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span aria-hidden="true">🐱</span>
          <span className="lf">Cat's<b> Tongue</b></span>
        </div>
        <div className="topbar-right">
          <span className="streak-pill">🔥 {stats?.streak_current ?? 0}</span>
          <button className="avatar-btn" onClick={() => navigate("/den")} aria-label="Your den">
            {avatarEmoji(profile?.avatar)}
          </button>
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
