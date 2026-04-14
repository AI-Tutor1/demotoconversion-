"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { initials } from "@/lib/utils";
import { LIGHT_GRAY, MUTED, NEAR_BLACK, BLUE } from "@/lib/types";
import { interpretationBadge } from "@/lib/scorecard";

export default function DraftsPage() {
  const { drafts, demos } = useStore();

  // Pending-review drafts joined to their demo, newest first by created_at.
  const queue = useMemo(() => {
    const demoById = new Map(demos.map((d) => [d.id, d]));
    return drafts
      .filter((d) => d.status === "pending_review")
      .map((d) => ({ draft: d, demo: demoById.get(d.demo_id) ?? null }))
      .sort((a, b) => b.draft.created_at.localeCompare(a.draft.created_at));
  }, [drafts, demos]);

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Pending review</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>AI draft queue.</h1>
          <p style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>
            {queue.length} draft{queue.length === 1 ? "" : "s"} waiting for analyst review.
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "32px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {queue.length === 0 ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                background: LIGHT_GRAY,
                borderRadius: 12,
                color: MUTED,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              No drafts waiting for review. Process a recording or click Analyze on a demo to generate one.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {queue.map(({ draft, demo }) => {
                const total = draft.draft_data.total_score;
                const badge = interpretationBadge(total);
                const studentName = demo?.student ?? `Demo ${draft.demo_id}`;
                return (
                  <div
                    key={draft.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "14px 18px",
                      background: "#fff",
                      border: "1px solid #e8e8ed",
                      borderRadius: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: LIGHT_GRAY,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 600,
                          flexShrink: 0,
                          color: NEAR_BLACK,
                        }}
                      >
                        {initials(studentName)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK }}>{studentName}</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                          {demo
                            ? `${demo.teacher} · ${demo.subject} · ${demo.level} · ${demo.date}`
                            : `Demo ID ${draft.demo_id} (not in current view)`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: NEAR_BLACK }}>
                        {total}
                        <span style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>/32</span>
                      </span>
                      <span
                        style={{
                          padding: "2px 10px",
                          borderRadius: 980,
                          background: badge.bg,
                          color: badge.fg,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {badge.label}
                      </span>
                      <Link
                        href={`/analyst/${draft.demo_id}`}
                        className="pill pill-blue"
                        style={{ padding: "6px 16px", fontSize: 12 }}
                      >
                        Review
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
