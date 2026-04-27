"use client";

// Two universes of "draft" live on this page; do not conflate them with
// /conducted or /analytics counts:
//   • salesQueue  — rows in `demos` with isDraft=true. Sales-submitted, no
//                    analyst review yet. Excluded from rangedDemos site-wide,
//                    so they never appear on /conducted or /analytics.
//   • aiQueue     — rows in `drafts` with status='pending_review'. AI scorecards
//                    awaiting analyst sign-off; the underlying demo IS in
//                    rangedDemos and DOES appear on /conducted and /analytics.
// Both queues are deliberately all-time (no global dateRange filter) so
// analysts never miss an old pending submission. Hero copy reflects this.

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { initials } from "@/lib/utils";
import { LIGHT_GRAY, MUTED, NEAR_BLACK, type DemoDraft } from "@/lib/types";
import { interpretationBadge, Q_KEYS } from "@/lib/scorecard";

export default function DraftsPage() {
  const { draftsByDemoId, demos, user, confirmDeleteDemo } = useStore();
  const canDelete = user?.role === "manager";

  // Latest pending-review AI draft per demo, newest first by created_at.
  // Demos with isDraft=true are filtered out so a demo can never appear in
  // both queues (belt-and-braces; the pipeline doesn't produce this today).
  const aiQueue = useMemo(() => {
    const demoById = new Map(demos.map((d) => [d.id, d]));
    return Object.values(draftsByDemoId)
      .filter((d): d is DemoDraft => !!d && d.status === "pending_review")
      .map((d) => ({ draft: d, demo: demoById.get(d.demo_id) ?? null }))
      .filter(({ demo }) => !demo?.isDraft)
      .sort((a, b) => b.draft.created_at.localeCompare(a.draft.created_at));
  }, [draftsByDemoId, demos]);

  // Sales-submitted demos awaiting analyst review, newest first.
  const salesQueue = useMemo(
    () =>
      demos
        .filter((d) => d.isDraft)
        .sort((a, b) => b.ts - a.ts),
    [demos]
  );

  const totalPending = aiQueue.length + salesQueue.length;

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Pending review</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Draft queue.</h1>
          <p style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>
            All-time queue · {totalPending} item{totalPending === 1 ? "" : "s"} waiting for analyst review.
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "32px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 40 }}>

          {/* ── Sales submissions awaiting analyst ── */}
          <div>
            <p className="section-label" style={{ marginBottom: 10 }}>
              Sales submissions awaiting analyst
              {salesQueue.length > 0 && (
                <span style={{ marginLeft: 8, background: "#FF9F0A", color: "#fff", borderRadius: 980, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                  {salesQueue.length}
                </span>
              )}
            </p>
            {salesQueue.length === 0 ? (
              <div
                style={{
                  padding: "32px 24px",
                  textAlign: "center",
                  background: LIGHT_GRAY,
                  borderRadius: 12,
                  color: MUTED,
                  fontSize: 14,
                }}
              >
                No sales submissions pending review.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {salesQueue.map((demo) => (
                  <div
                    key={demo.id}
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      gap: 8,
                    }}
                  >
                  <Link
                    href={`/analyst/${demo.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "14px 18px",
                      background: "#fff",
                      border: "1px solid #e8e8ed",
                      borderLeft: "3px solid #FF9F0A",
                      borderRadius: 12,
                      flexWrap: "wrap",
                      textDecoration: "none",
                      color: "inherit",
                      cursor: "pointer",
                      transition: "background 0.15s",
                      flex: 1,
                      minWidth: 0,
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
                        {initials(demo.student)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK }}>{demo.student}</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                          {demo.teacher} · {demo.subject} · {demo.level} · {demo.date}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "2px 10px",
                        borderRadius: 980,
                        background: "#FFF8E1",
                        color: "#8B6914",
                        fontSize: 11,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Awaiting review
                    </span>
                  </Link>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => confirmDeleteDemo(demo)}
                        className="pill pill-outline"
                        style={{ fontSize: 11, padding: "3px 12px", color: "#B42318", borderColor: "#FDA29B", alignSelf: "center" }}
                        title="Delete demo"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── AI drafts pending review ── */}
          <div>
            <p className="section-label" style={{ marginBottom: 10 }}>
              AI drafts pending review
              {aiQueue.length > 0 && (
                <span style={{ marginLeft: 8, background: "#0071e3", color: "#fff", borderRadius: 980, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                  {aiQueue.length}
                </span>
              )}
            </p>
            {aiQueue.length === 0 ? (
              <div
                style={{
                  padding: "32px 24px",
                  textAlign: "center",
                  background: LIGHT_GRAY,
                  borderRadius: 12,
                  color: MUTED,
                  fontSize: 14,
                }}
              >
                No AI drafts waiting for review. Submit a demo with a recording link — AI analysis runs automatically.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {aiQueue.map(({ draft, demo }) => {
                  const total = Q_KEYS.reduce((sum, k) => sum + (draft.draft_data[k]?.score ?? 0), 0);
                  const badge = interpretationBadge(total);
                  const studentName = demo?.student ?? `Demo ${draft.demo_id}`;
                  return (
                    <div
                      key={draft.id}
                      style={{
                        display: "flex",
                        alignItems: "stretch",
                        gap: 8,
                      }}
                    >
                    <Link
                      href={`/analyst/${draft.demo_id}`}
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
                        textDecoration: "none",
                        color: "inherit",
                        cursor: "pointer",
                        transition: "background 0.15s",
                        flex: 1,
                        minWidth: 0,
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
                      </div>
                    </Link>
                      {canDelete && demo && (
                        <button
                          type="button"
                          onClick={() => confirmDeleteDemo(demo)}
                          className="pill pill-outline"
                          style={{ fontSize: 11, padding: "3px 12px", color: "#B42318", borderColor: "#FDA29B", alignSelf: "center" }}
                          title="Delete demo"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </section>
    </>
  );
}
