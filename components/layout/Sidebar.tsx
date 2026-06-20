"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: "🏠", group: "Overview" },
  { href: "/import", label: "Import", icon: "📥", group: "Library" },
  { href: "/topics", label: "Topics", icon: "🗂️", group: "Library" },
  { href: "/questions", label: "Questions", icon: "❓", group: "Library" },
  { href: "/search", label: "Search", icon: "🔍", group: "Library" },
  { href: "/settings", label: "Settings", icon: "⚙️", group: "System" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setStreak(d?.streak?.currentStreak ?? 0))
      .catch(() => {});
  }, []);

  const groups = Array.from(new Set(navItems.map((n) => n.group)));

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo">
        <img src="/icon-192.png" alt="ReviseX" style={{ width: 32, height: 32, borderRadius: 6 }} />
        <span className="sidebar-logo-text">ReviseX</span>
      </div>

      <nav className="sidebar-nav">
        {groups.map((group) => (
          <div key={group}>
            <div className="nav-group-label">{group}</div>
            {navItems
              .filter((n) => n.group === group)
              .map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${isActive ? "active" : ""}`}
                  >
                    <span style={{ fontSize: 15 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="streak-widget">
          <div className="streak-flame">🔥</div>
          <div>
            <div className="streak-count">{streak}</div>
            <div className="streak-label">Day streak</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
