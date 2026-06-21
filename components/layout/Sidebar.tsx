"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Search", icon: "🔍" },
  { href: "/topics", label: "Topics", icon: "🗂️" },
  { href: "/questions", label: "Questions", icon: "❓" },
  { href: "/import", label: "Import", icon: "📥" },
  { href: "/facts", label: "Daily Facts", icon: "💡" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo">
        <img src="/logo-horizontal.png" alt="NeomX" style={{ height: 32, objectFit: "contain", maxWidth: "100%" }} />
      </div>

      <nav className="sidebar-nav">
        <div>
          {navItems.map((item) => {
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
      </nav>
    </aside>
  );
}

