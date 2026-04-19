"use client";
import { useMemo } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import SessionStatusBadge from "@/components/session-status-badge";
import { useStore } from "@/lib/store";
import { LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK } from "@/lib/types";
import type { TeacherSession } from "@/lib/types";
import { SCORECARD_MAX, interpretationBadge, scoreColor } from "@/lib/scorecard";

type Props = {
  teacherUserId?: string;
  studentUserId?: string;
  // Optional predicate layered AFTER the teacher/student FK match so callers
  // can narrow sessions by subject, grade, date window, etc. — used by the
  // /teachers drill panel to flow its filters into the Product log tab.
  filterFn?: (s: TeacherSession) => boolean;
};

// Product log. Shows every session for a teacher or student with a status
// pill — pending / processing / scored / approved / failed.
//
// Match key is teacher_user_id (stable FK), NEVER teacher_user_name.
// See memory/feedback_join_by_stable_fk.md for the rationale: the old
// name-based filter silently returned zero rows whenever the display
// name and the DB column drifted (whitespace, casing, nbsp), which
// caused approved sessions to be hidden from /teachers on 2026-04-19.
//
// Visible only to analyst + manager; sessions RLS already blocks other roles.
export function TeacherProductLog({ teacherUserId, studentUserId, filterFn }: Props) {
  const { teacherSessions, user } = useStore();

  const rows: TeacherSession[] = useMemo(() => {
    if (user?.role !== "analyst" && user?.role !== "manager") return [];
    const matchByTeacher = (s: TeacherSession) =>
      !!teacherUserId && s.teacherUserId === teacherUserId;
    const matchByStudent = (s: TeacherSession) =>
      !!studentUserId && s.studentUserId === studentUserId;
    return teacherSessions
      .filter((s) => matchByTeacher(s) || matchByStudent(s))
      .filter((s) => !filterFn || filterFn(s))
      .sort((a, b) => (b.sessionDate ?? "").localeCompare(a.sessionDate ?? ""));
  }, [teacherSessions, teacherUserId, studentUserId, filterFn, user?.role]);

  const approvedCount = useMemo(
    () => rows.filter((r) => r.processingStatus === "approved").length,
    [rows]
  );

  if (user?.role !== "analyst" && user?.role !== "manager") {
    return <EmptyState text="Product log is visible to analysts and managers only." />;
  }

  if (rows.length === 0) {
    return <EmptyState text="No sessions recorded yet. Uploaded sessions appear here with a status pill — pending, scored, approved, or failed." />;
  }

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 12 }}>
        {rows.length} session{rows.length !== 1 ? "s" : ""} · {approvedCount} approved
      </div>
      {rows.map((s) => {
        const hasScorecard = typeof s.scorecardTotal === "number";
        const interp = hasScorecard ? interpretationBadge(s.scorecardTotal as number) : null;
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
                <SessionStatusBadge status={s.processingStatus} />
                {interp && (
                  <span
                    style={{
                      padding: "3px 12px", borderRadius: 980, fontSize: 12, fontWeight: 600,
                      background: interp.bg, color: interp.fg,
                    }}
                  >
                    {interp.label}
                  </span>
                )}
                <span style={{ color: BLUE, fontSize: 12, fontWeight: 600 }}>View →</span>
              </div>
            </div>

            {hasScorecard ? (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>Scorecard</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(s.scorecardTotal as number, SCORECARD_MAX) }}>
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
                    <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>Reviewed</span>
                    <span style={{ fontSize: 12, color: NEAR_BLACK }}>
                      {new Date(s.reviewedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>
                Awaiting analyst review.
              </div>
            )}

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
