"use client";
import { EmptyState } from "@/components/ui";
import { CARD_DARK, MUTED } from "@/lib/types";
import { SCORECARD_MAX, scoreColor, type WeakestQuestion } from "@/lib/scorecard";

export interface TeacherLeaderboardRow {
  groupKey: string;
  teacherUserId: string | null;
  teacherUserName: string;
  count: number;
  avgScore: number;
  weakest: WeakestQuestion | null;
}

interface Props {
  rows: TeacherLeaderboardRow[];
  onOpen: (groupKey: string) => void;
}

// Dark card grid. Each card is a click target that opens the per-teacher
// drawer. Avg score colour-coded via scoreColor; weakest-Q short label
// surfaces the rubric dimension the teacher is most behind on.
export default function SessionsTeacherLeaderboard({ rows, onOpen }: Props) {
  const ranked = rows.slice(0, 12);

  return (
    <section style={{ background: "#000", color: "#fff", padding: "44px 24px 36px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <p className="section-label" style={{ color: MUTED }}>Performance</p>
          <h2 style={{ fontSize: 32, fontWeight: 600, marginTop: 6 }}>Teacher leaderboard</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 6 }}>
            Click a teacher to see their scorecard breakdown.
          </p>
        </div>
        {ranked.length === 0 ? (
          <div
            style={{
              background: CARD_DARK,
              borderRadius: 16,
              padding: "28px 24px",
              textAlign: "center",
              color: MUTED,
              fontSize: 14,
            }}
          >
            No teachers ranked yet
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            {ranked.map((row, i) => {
              const avg = row.avgScore;
              const avgColor = scoreColor(avg, SCORECARD_MAX);
              const avgPct = Math.round((avg / SCORECARD_MAX) * 100);
              const hasId = !!row.teacherUserId;
              return (
                <button
                  key={row.groupKey}
                  type="button"
                  onClick={() => onOpen(row.groupKey)}
                  className="animate-fade-up-2"
                  style={{
                    background: CARD_DARK,
                    borderRadius: 16,
                    padding: "22px 20px",
                    textAlign: "left",
                    border: "1px solid rgba(255,255,255,0.06)",
                    cursor: "pointer",
                    color: "#fff",
                    transition: "transform 0.15s ease, border-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 600,
                        color: i === 0 ? "#FFD60A" : "rgba(255,255,255,.22)",
                        lineHeight: 1,
                      }}
                    >
                      #{i + 1}
                    </div>
                    {!hasId && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: "#FF9F0A",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        missing id
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 600,
                      color: "#fff",
                      marginTop: 8,
                      lineHeight: 1.2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.teacherUserName || "—"}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginTop: 14,
                    }}
                  >
                    <div style={{ background: "#2c2c2e", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: avgColor }}>
                        {avg.toFixed(1)}
                      </div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Avg / {SCORECARD_MAX}</div>
                    </div>
                    <div style={{ background: "#2c2c2e", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{row.count}</div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Approved</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: MUTED, lineHeight: 1.4 }}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Avg</span>{" "}
                    <span style={{ color: avgColor }}>{avgPct}%</span>
                    {row.weakest && (
                      <>
                        <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.4)" }}>·</span>{" "}
                        <span style={{ color: "#FF9F0A" }}>Weakest: {row.weakest.label.split(" — ")[0]}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {ranked.length === 0 && <EmptyState text="" />}
      </div>
    </section>
  );
}
