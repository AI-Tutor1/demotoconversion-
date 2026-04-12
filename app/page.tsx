"use client";

import { useStore } from "@/lib/store";
import { StatusBadge } from "@/components/ui";
import { initials } from "@/lib/utils";
import { NEAR_BLACK, LIGHT_GRAY, MUTED, BLUE } from "@/lib/types";
import Link from "next/link";

export default function DashboardPage() {
  const { stats, rangedDemos, activity, dateRange, user } = useStore();

  const emptyMessage =
    user?.role === "sales_agent"
      ? "No demos assigned to you yet. Demos will appear here once an analyst submits a review and it's routed to you."
      : user?.role === "analyst"
      ? "No demos in your queue. Claim a demo from the unassigned pool or wait for auto-assignment."
      : "No demos match the current filter.";

  return (
    <>
      {/* Hero */}
      <section style={{ background: "#000", color: "#fff", paddingTop: 104, paddingBottom: 64, textAlign: "center" }}>
        <div className="animate-fade-up" style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label" style={{ color: MUTED }}>Demo to Conversion</p>
          <h1 style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.07, letterSpacing: "-0.28px", marginTop: 6 }}>
            Analysis Platform
          </h1>
          <p style={{ fontSize: 21, fontWeight: 400, lineHeight: 1.19, color: "rgba(255,255,255,.6)", marginTop: 16 }}>
            Track, evaluate, and convert demo sessions into enrollments.
          </p>
          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center" }}>
            <Link href="/analyst" className="pill pill-blue">New demo review</Link>
            <Link href="/kanban" className="pill pill-white">Kanban board</Link>
          </div>
          {dateRange !== "all" && (
            <p style={{ fontSize: 12, color: MUTED, marginTop: 16 }}>Showing: last {dateRange}</p>
          )}
        </div>
      </section>

      {/* KPIs */}
      <section style={{ background: LIGHT_GRAY, padding: "44px 24px" }}>
        <div className="animate-fade-up-1" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          {[
            { l: "Total demos", v: stats.total, c: NEAR_BLACK },
            { l: "Conversion rate", v: stats.rate + "%", c: stats.rate >= 40 ? "#1b8a4a" : "#B25000" },
            { l: "Pending", v: stats.pending, c: "#B25000" },
            { l: "Avg. rating", v: stats.avgR + "/5", c: BLUE },
            { l: "POUR rate", v: stats.pourRate + "%", c: "#AF52DE" },
            { l: "Not converted", v: stats.notConv, c: "#c13030" },
          ].map((m, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "18px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1, color: m.c }}>{m.v}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: MUTED, marginTop: 5 }}>{m.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent + Activity */}
      <section style={{ background: "#fff", padding: "44px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,300px)", gap: 24 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Recent demos</h2>
            {rangedDemos.length === 0 && (
              <div style={{ padding: "32px 20px", textAlign: "center", background: LIGHT_GRAY, borderRadius: 12, color: MUTED, fontSize: 13, lineHeight: 1.47 }}>
                {emptyMessage}
              </div>
            )}
            {rangedDemos.slice(0, 6).map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: LIGHT_GRAY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
                    {initials(d.student)}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{d.student}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{d.teacher} · {d.subject} · {d.date}</div>
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Activity log</h2>
            {activity.slice(0, 8).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f7", alignItems: "start" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.action === "converted" ? "#30D158" : a.action.includes("escalat") ? "#FF3B30" : BLUE, flexShrink: 0, marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                    <strong>{a.user}</strong> {a.action} <span style={{ color: BLUE }}>{a.target}</span>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
