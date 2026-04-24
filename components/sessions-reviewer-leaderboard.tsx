"use client";
import { CARD_DARK, MUTED } from "@/lib/types";

export interface ReviewerLeaderboardRow {
  reviewerId: string;
  name: string;
  count: number;
  avgApproval: number | null; // 0..1 fraction of fields accepted
}

interface Props {
  rows: ReviewerLeaderboardRow[];
}

function approvalColor(v: number | null): string {
  if (v === null) return "#fff";
  if (v >= 0.9) return "#30D158";
  if (v >= 0.7) return "#FF9F0A";
  return "#E24B4A";
}

// Dark card grid on the black footer. Surfaces reviewer throughput
// (approvals count) and quality (avg approval_rate = % fields accepted).
export default function SessionsReviewerLeaderboard({ rows }: Props) {
  const ranked = rows.slice(0, 8);
  return (
    <section style={{ background: "#000", color: "#fff", padding: "24px 24px 52px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <p className="section-label" style={{ color: MUTED }}>Throughput</p>
          <h2 style={{ fontSize: 28, fontWeight: 600, marginTop: 4 }}>Reviewer leaderboard</h2>
        </div>
        {ranked.length === 0 ? (
          <div
            style={{
              background: CARD_DARK,
              borderRadius: 16,
              padding: "24px 20px",
              textAlign: "center",
              color: MUTED,
              fontSize: 13,
            }}
          >
            No reviewers attributed
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 14,
            }}
          >
            {ranked.map((row, i) => (
              <div
                key={row.reviewerId}
                className="animate-fade-up-2"
                style={{
                  background: CARD_DARK,
                  borderRadius: 16,
                  padding: "20px 18px",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 600,
                    color: i === 0 ? "#FFD60A" : "rgba(255,255,255,.22)",
                    lineHeight: 1,
                  }}
                >
                  #{i + 1}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#fff",
                    marginTop: 8,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name}
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
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{row.count}</div>
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Approvals</div>
                  </div>
                  <div style={{ background: "#2c2c2e", borderRadius: 8, padding: "8px 10px" }}>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: approvalColor(row.avgApproval),
                      }}
                    >
                      {row.avgApproval === null ? "—" : `${Math.round(row.avgApproval * 100)}%`}
                    </div>
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Avg approval</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
