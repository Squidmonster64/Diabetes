import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Today" },
  { to: "/history", label: "History" },
  { to: "/trends", label: "Trends" },
  { to: "/foods", label: "Foods" },
  { to: "/profile", label: "Profile" },
];

export function Shell({ title, children, showNav = true }: { title: string; children: ReactNode; showNav?: boolean }) {
  const location = useLocation();
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>{title}</h1>
        <span className="beta-chip">Beta</span>
      </header>
      <main className="screen">{children}</main>
      {showNav ? (
        <nav className="nav-tabs" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive || (item.to === "/" && location.pathname === "/") ? "active" : "")} end={item.to === "/"}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function AppOutlet() {
  return <Outlet />;
}
