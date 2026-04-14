"use client";

import { useStore } from "@/lib/store";
import { BLUE, LIGHT_GRAY, MUTED, NEAR_BLACK, type Demo, type DemoDraft } from "@/lib/types";
import {
  Q_KEYS,
  Q_META,
  interpretationBadge,
  scoreColor,
} from "@/lib/scorecard";

interface ScorecardReportProps {
  demo: Demo;
  draft: DemoDraft;
}

// Read-only view shown on /analyst/[id] once a draft has been finalized.
// Keeps the same split layout as DraftReview (scorecard left, transcript
// right) but with no toggles, no submit, no edit affordances. Anyone with
// the link can use this as the canonical post-review report.
export function ScorecardReport({ demo, draft }: ScorecardReportProps) {
  const { user } = useStore();
  const d = draft.draft_data;
  const badge = interpretationBadge(d.total_score);

  const reviewedAt = draft.reviewed_at
    ? new Date(draft.reviewed_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  // We only have the auth user's UUID in reviewed_by; resolve to the
  // current user's full name when it matches, otherwise fall back to a
  // generic "Reviewed on …" label.
  const reviewedByLabel =
    draft.reviewed_by && user && draft.reviewed_by === user.id
      ? `you on ${reviewedAt}`
      : reviewedAt
      ? `another analyst on ${reviewedAt}`
      : "—";

  const statusLabel =
    draft.status === "approved" ? "Approved" : "Approved (with edits)";
  const statusBg = draft.status === "approved" ? "#E8F5E9" : "#E3F2FD";
  const statusFg = draft.status === "approved" ? "#1B5E20" : "#0D47A1";

  return (
    <div
      style={{
        maxWidth: 1300,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 380px)",
        gap: 16,
      }}
    >
      {/* Left — read-only scorecard */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e8e8ed",
          borderRadius: 12,
          padding: 24,
        }}
      >
        {/* Total + interpretation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 36, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1 }}>
              {d.total_score}
              <span style={{ fontSize: 18, color: MUTED, fontWeight: 400 }}>/32</span>
            </span>
            <span
              style={{
                padding: "3px 12px",
                borderRadius: 980,
                background: badge.bg,
                color: badge.fg,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {badge.label}
            </span>
          </div>
          <span
            style={{
              padding: "3px 12px",
              borderRadius: 980,
              background: statusBg,
              color: statusFg,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {statusLabel}
          </span>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.5, color: NEAR_BLACK, marginBottom: 24 }}>
          {d.score_interpretation}
        </p>

        {/* Q1-Q8 cards */}
        <div className="section-label" style={{ marginBottom: 10 }}>
          Question scores
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {Q_KEYS.map((k) => {
            const meta = Q_META[k];
            const se = d[k];
            return (
              <div
                key={k}
                style={{
                  display: "grid",
                  gridTemplateColumns: "52px 1fr",
                  gap: 14,
                  padding: 14,
                  background: LIGHT_GRAY,
                  border: "1px solid #e8e8ed",
                  borderLeft: `4px solid ${scoreColor(se.score, meta.max)}`,
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 10,
                    background: scoreColor(se.score, meta.max),
                    color: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{se.score}</span>
                  <span style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>/{meta.max}</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NEAR_BLACK }}>
                    {meta.label}
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{meta.scaleLabel}</div>
                  <div style={{ fontSize: 13, color: NEAR_BLACK, marginTop: 6, lineHeight: 1.45 }}>
                    {se.evidence || "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* POUR */}
        <div className="section-label" style={{ marginBottom: 10 }}>
          POUR issues
        </div>
        {d.pour_issues.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>None observed.</p>
        ) : (
          <div style={{ marginBottom: 24 }}>
            {d.pour_issues.map((p, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <span className="pour-tag">{p.category}</span>
                {p.description && (
                  <span style={{ fontSize: 13, color: MUTED, marginLeft: 8 }}>{p.description}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Overall summary */}
        <div className="section-label" style={{ marginBottom: 6 }}>
          Overall summary
        </div>
        <p style={{ fontSize: 14, color: NEAR_BLACK, lineHeight: 1.55, marginBottom: 18 }}>
          {d.overall_summary || "—"}
        </p>

        {/* Improvement suggestions */}
        <div className="section-label" style={{ marginBottom: 6 }}>
          Improvement suggestions
        </div>
        <p style={{ fontSize: 14, color: NEAR_BLACK, lineHeight: 1.55, marginBottom: 18 }}>
          {d.improvement_suggestions || "—"}
        </p>

        {/* Improvement focus */}
        <div className="section-label" style={{ marginBottom: 6 }}>
          Improvement focus
        </div>
        <p style={{ fontSize: 14, color: BLUE, fontWeight: 500, marginBottom: 24 }}>
          {d.improvement_focus || "—"}
        </p>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid #e8e8ed",
            paddingTop: 14,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            fontSize: 12,
            color: MUTED,
          }}
        >
          <span>Reviewed by {reviewedByLabel}</span>
          {draft.approval_rate !== null && (
            <span>
              Approval rate:{" "}
              <strong style={{ color: NEAR_BLACK }}>
                {Math.round(draft.approval_rate * 100)}%
              </strong>{" "}
              <span style={{ color: MUTED }}>(fields kept as AI-drafted)</span>
            </span>
          )}
        </div>
      </div>

      {/* Right — transcript reference panel (sticky on tall viewports) */}
      <aside
        style={{
          background: "#fff",
          border: "1px solid #e8e8ed",
          borderRadius: 12,
          padding: 16,
          maxHeight: "calc(100vh - 140px)",
          overflowY: "auto",
          position: "sticky",
          top: 100,
          alignSelf: "start",
        }}
      >
        <div className="section-label" style={{ marginBottom: 8 }}>
          Transcript
        </div>
        {demo.transcript ? (
          <pre
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11,
              lineHeight: 1.55,
              color: NEAR_BLACK,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
            }}
          >
            {demo.transcript}
          </pre>
        ) : (
          <p style={{ fontSize: 13, color: MUTED }}>No transcript on file.</p>
        )}
      </aside>
    </div>
  );
}
