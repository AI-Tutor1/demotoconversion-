"use client";

import { BLUE, LIGHT_GRAY, MUTED, NEAR_BLACK, type DemoDraft } from "@/lib/types";
import { Q_KEYS, Q_META, interpretationBadge, scoreColor } from "@/lib/scorecard";

interface ScorecardSummaryProps {
  draft: DemoDraft;
  recording?: string;
  studentRaw?: number;
}

// Compact, read-only scorecard — used in the Sales detail panel and anywhere
// else a concise "what did the analyst see in this demo" view is needed.
export function ScorecardSummary({ draft, recording, studentRaw }: ScorecardSummaryProps) {
  const d = draft.draft_data;
  const badge = interpretationBadge(d.total_score);

  return (
    <div style={{ background: LIGHT_GRAY, borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div className="section-label">QA Scorecard</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: NEAR_BLACK }}>
            {d.total_score}
            <span style={{ fontSize: 12, color: MUTED, fontWeight: 400 }}>/32</span>
          </span>
          <span style={{ padding: "2px 10px", borderRadius: 980, background: badge.bg, color: badge.fg, fontSize: 11, fontWeight: 600 }}>
            {badge.label}
          </span>
        </div>
      </div>

      {recording && (
        <p style={{ fontSize: 12, marginBottom: 10 }}>
          <span style={{ color: MUTED, marginRight: 6 }}>Recording:</span>
          <a href={recording} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontWeight: 500 }}>
            Open ↗
          </a>
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Q_KEYS.map((k) => {
          const meta = Q_META[k];
          const se = d[k];
          return (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "auto minmax(120px, 160px) 1fr", gap: 10, alignItems: "start" }}>
              <span
                style={{
                  width: 28,
                  height: 22,
                  borderRadius: 6,
                  background: scoreColor(se.score, meta.max),
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {se.score}/{meta.max}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: NEAR_BLACK }}>{meta.shortLabel}</span>
              <span
                style={{
                  fontSize: 12,
                  color: MUTED,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={se.evidence}
              >
                {se.evidence || "—"}
              </span>
            </div>
          );
        })}
      </div>

      {d.pour_issues.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {d.pour_issues.map((p, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span className="pour-tag">{p.category}</span>
              {p.description && <span style={{ fontSize: 12, color: MUTED, marginLeft: 6 }}>{p.description}</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {typeof studentRaw === "number" && (
          <span style={{ fontSize: 12, color: MUTED }}>
            Student: <strong>{Math.round(studentRaw / 2)}/5</strong>
          </span>
        )}
        <span style={{ fontSize: 12, color: MUTED }}>
          Focus: <strong style={{ color: NEAR_BLACK }}>{d.improvement_focus || "—"}</strong>
        </span>
      </div>

      {d.improvement_suggestions && (
        <p style={{ fontSize: 12, color: BLUE, marginTop: 6, fontWeight: 500 }}>
          Suggestion: {d.improvement_suggestions}
        </p>
      )}
    </div>
  );
}
