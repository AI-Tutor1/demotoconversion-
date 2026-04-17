"use client";
import { useMemo } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { useStore } from "@/lib/store";
import { LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK } from "@/lib/types";
import type { ApprovedSession } from "@/lib/types";
import { SCORECARD_MAX, interpretationBadge, scoreColor } from "@/lib/scorecard";

type Props = {
  teacherUserName?: string;
  studentUserId?: string;
};

// Approved-sessions list. One component, two consumers:
//   /teachers  → pass teacherUserName
//   /students  → pass studentUserId (future)
// Visible only to analyst + manager; sessions RLS already blocks other roles.
export function TeacherProductLog({ teacherUserName, studentUserId }: Props) {
  const { approvedSessions, user } = useStore();

  const rows: ApprovedSession[] = useMemo(() => {
    if (user?.role !== "analyst" && user?.role !== "manager") return [];
    const matchByTeacher = (s: ApprovedSession) =>
      !!teacherUserName &&
      (s.teacherUserName ?? "").toLowerCase() === teacherUserName.toLowerCase();
    const matchByStudent = (s: ApprovedSession) =>
      !!studentUserId && s.studentUserId === studentUserId;
    return approvedSessions
      .filter((s) => matchByTeacher(s) || matchByStudent(s))
      .sort((a, b) => (b.sessionDate ?? "").localeCompare(a.sessionDate ?? ""));
  }, [approvedSessions, teacherUserName, studentUserId, user?.role]);

  if (user?.role !== "analyst" && user?.role !== "manager") {
    return <EmptyState text="Product log is visible to analysts and managers only." />;
  }

  if (rows.length === 0) {
    return <EmptyState text="No approved sessions yet. Once a session scorecard is approved in /sessions, it will appear here." />;
  }

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 12 }}>
        {rows.length} approved session{rows.length !== 1 ? "s" : ""}
      </div>
      {rows.map((s) => {
        const interp = interpretationBadge(s.scorecardTotal);
        const studentLabel = s.studentUserName || s.expectedStudent1 || "—";
        return (
          <Link
            key={s.id}
            href={`/sessions/${s.id}`}
            style={{
              display: "block",
              background: LIGHT_GRAY,
              border: "1px solid #e8e8ed",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 10,
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK }}>{studentLabel}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {s.sessionDate ?? "—"} · {s.grade || "—"} · {s.subject || "—"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    padding: "3px 12px", borderRadius: 980, fontSize: 12, fontWeight: 600,
                    background: interp.bg, color: interp.fg,
                  }}
                >
                  {interp.label}
                </span>
                <span style={{ color: BLUE, fontSize: 12, fontWeight: 600 }}>View →</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>Scorecard</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(s.scorecardTotal, SCORECARD_MAX) }}>
                  {s.scorecardTotal}/{SCORECARD_MAX}
                </span>
              </div>
              {s.pourIssues.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>POUR</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {s.pourIssues.slice(0, 3).map((p, i) => (
                      <span key={i} className="pour-tag" style={{ fontSize: 10 }}>{p.category}</span>
                    ))}
                    {s.pourIssues.length > 3 && (
                      <span style={{ fontSize: 11, color: MUTED }}>+{s.pourIssues.length - 3}</span>
                    )}
                  </div>
                </div>
              )}
              {s.reviewedAt && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>Approved</span>
                  <span style={{ fontSize: 12, color: NEAR_BLACK }}>
                    {new Date(s.reviewedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {s.improvementSuggestions && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>
                  Improvement focus
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.47, color: NEAR_BLACK, margin: 0 }}>
                  {s.improvementSuggestions}
                </p>
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
