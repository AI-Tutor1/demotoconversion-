"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { MUTED } from "@/lib/types";
import { exportCSV } from "@/lib/utils";

const NAV_ITEMS: { label: string; href: string; roles?: ("analyst" | "sales_agent" | "manager")[] }[] = [
  { label: "Dashboard", href: "/" },
  { label: "Analyst",   href: "/analyst",   roles: ["analyst", "manager"] },
  { label: "Drafts",    href: "/drafts",    roles: ["analyst", "manager"] },
  { label: "Sales",      href: "/sales",      roles: ["sales_agent", "manager"] },
  { label: "Conducted",  href: "/conducted" },
  { label: "Kanban",    href: "/kanban" },
  { label: "Analytics", href: "/analytics" },
  { label: "Teachers",  href: "/teachers" },
  { label: "Enrollments", href: "/enrollments", roles: ["analyst", "manager"] },
  { label: "Sessions",    href: "/sessions",    roles: ["analyst", "manager"] },
  { label: "Data quality", href: "/admin/data-quality", roles: ["manager"] },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { dateRange, setDateRange, notifications, rangedDemos, user, demos } =
    useStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Outside click dismiss — notifications
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  // Outside click dismiss — user menu
  useEffect(() => {
    if (!userOpen) return;
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userOpen]);

  // ESC key for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && searchOpen) setSearchOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [searchOpen]);

  // Hide nav on login route (after all hooks so hook order stays stable)
  if (pathname === "/login") return null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUserOpen(false);
    router.push("/login");
    router.refresh();
  };

  const initial = user?.full_name?.trim().charAt(0).toUpperCase() || "·";

  const searchResults = searchQ.trim()
    ? demos.filter(
        (d) =>
          d.student.toLowerCase().includes(searchQ.toLowerCase()) ||
          d.teacher.toLowerCase().includes(searchQ.toLowerCase()) ||
          d.subject.toLowerCase().includes(searchQ.toLowerCase())
      )
    : [];

  return (
    <>
      <nav className="nav-bar">
        <div className="nav-inner">
          {/* Apple logo */}
          <svg width="14" height="17" viewBox="0 0 17 21" fill="#fff" style={{ marginRight: 16, flexShrink: 0 }}>
            <path d="M15.5 17.4c-.8 1.2-1.7 2.4-3 2.4-1.3 0-1.7-.8-3.2-.8s-2 .8-3.2.8c-1.3 0-2.3-1.3-3.1-2.5C1.2 14.6.2 11 1.5 8.6c.9-1.6 2.4-2.7 4-2.7 1.3 0 2.3.9 3.1.9.8 0 2-.9 3.4-.8.6 0 2.2.2 3.2 1.7-2.8 1.7-2.3 5.9.3 7.1zM12 3.6c.7-.9 1.2-2.1 1.1-3.3-1.1.1-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.2 1.2.1 2.3-.6 3.1-1.5z" />
          </svg>

          {/* Nav links (filtered to current user's role) */}
          <div style={{ display: "flex", alignItems: "center", flex: 1, overflow: "auto", scrollbarWidth: "none" }}>
            {NAV_ITEMS.filter(
              (item) => !item.roles || (user && item.roles.includes(user.role))
            ).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={"nav-link" + (pathname === item.href ? " active" : "")}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Date range */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="nav-select"
            >
              <option value="all">All time</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
            </select>

            {/* Search */}
            <button
              onClick={() => { setSearchOpen(true); setSearchQ(""); }}
              className="nav-icon-btn"
            >
              <svg width="15" height="15" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.5">
                <circle cx="6.5" cy="6.5" r="5" />
                <line x1="10" y1="10" x2="14" y2="14" strokeLinecap="round" />
              </svg>
            </button>

            {/* Notifications */}
            <div ref={notifRef} style={{ position: "relative" }}>
              <button onClick={() => setNotifOpen((p) => !p)} className="nav-icon-btn" style={{ position: "relative" }}>
                <svg width="15" height="15" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.5">
                  <path d="M7.5 1a4 4 0 014 4c0 2.7 1.5 3.5 1.5 3.5H2S3.5 7.7 3.5 5a4 4 0 014-4zM6 12a1.5 1.5 0 003 0" strokeLinecap="round" />
                </svg>
                {notifications.length > 0 && <span className="notif-badge">{notifications.length}</span>}
              </button>
              {notifOpen && (
                <div className="notif-dropdown animate-slide-in">
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #e8e8ed", fontSize: 13, fontWeight: 600 }}>
                    Notifications ({notifications.length})
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: MUTED, fontSize: 13 }}>All clear</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="notif-item">
                        <span className="notif-dot" />
                        <div>
                          <div style={{ fontSize: 13, lineHeight: 1.4 }}>{n.text}</div>
                          <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{n.time}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Export */}
            <button
              onClick={() => exportCSV(rangedDemos as unknown as Record<string, unknown>[])}
              className="nav-icon-btn"
              title="Export CSV"
            >
              <svg width="15" height="15" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M7.5 2v8M4 7l3.5 3 3.5-3M2 12h11" />
              </svg>
            </button>

            {/* User menu */}
            {user && (
              <div ref={userRef} style={{ position: "relative", marginLeft: 4 }}>
                <button
                  onClick={() => setUserOpen((p) => !p)}
                  title={user.email}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "#0071e3",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {initial}
                </button>
                {userOpen && (
                  <div
                    className="notif-dropdown animate-slide-in"
                    style={{ minWidth: 220, right: 0, left: "auto" }}
                  >
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #e8e8ed" }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{user.full_name}</div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                        {user.email}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
                        {user.role.replace("_", " ")}
                      </div>
                    </div>
                    <button
                      onClick={handleSignOut}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "11px 16px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 13,
                        color: "#1d1d1f",
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Search overlay */}
      {searchOpen && (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="search-box" onClick={(e) => e.stopPropagation()}>
            <div className="search-header">
              <svg width="16" height="16" fill="none" stroke={MUTED} strokeWidth="1.5">
                <circle cx="7" cy="7" r="5.5" />
                <line x1="11" y1="11" x2="15" y2="15" strokeLinecap="round" />
              </svg>
              <input
                autoFocus
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search students, teachers, subjects..."
                className="search-input"
              />
              <button onClick={() => setSearchOpen(false)} className="search-esc">
                ESC
              </button>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {searchQ.trim() && searchResults.length === 0 && (
                <div style={{ padding: 28, textAlign: "center", color: MUTED, fontSize: 14 }}>
                  No results found
                </div>
              )}
              {searchResults.slice(0, 8).map((d) => (
                <Link
                  key={d.id}
                  href={`/sales?demo=${d.id}`}
                  onClick={() => setSearchOpen(false)}
                  className="search-result"
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{d.student}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>
                      {d.teacher} · {d.subject} · {d.date}
                    </div>
                  </div>
                </Link>
              ))}
              {!searchQ.trim() && (
                <div style={{ padding: 28, textAlign: "center", color: MUTED, fontSize: 14 }}>
                  Type to search across all demos
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
