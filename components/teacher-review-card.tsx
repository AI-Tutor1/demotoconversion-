"use client";

import { useStore } from "@/lib/store";
import { Stars } from "@/components/ui";
import {
  BLUE,
  MUTED,
  NEAR_BLACK,
  RUBRIC_BY_TYPE,
  REVIEW_TYPE_LABEL,
  REVIEW_TYPE_COLOR,
  type TeacherReview,
} from "@/lib/types";

const BLUE_TEXT = BLUE;

interface Props {
  review: TeacherReview;
}

export default function TeacherReviewCard({ review }: Props) {
  const { user, confirmDeleteTeacherReview } = useStore();
  const isManager = user?.role === "manager";
  const rubric = RUBRIC_BY_TYPE[review.reviewType];
  const reviewDateStr = formatDate(review.reviewDate);
  const createdAtStr  = formatDate(review.createdAt);
  // Show created_at in muted text only if it differs from review_date
  // (e.g., the analyst back-dated the review).
  const showLogged = !sameDay(review.reviewDate, review.createdAt);

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e8e8ed",
      borderRadius: 12,
      padding: "14px 18px",
      marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span
              className="pill"
              style={{
                padding: "3px 10px",
                fontSize: 10,
                fontWeight: 700,
                background: REVIEW_TYPE_COLOR[review.reviewType],
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {REVIEW_TYPE_LABEL[review.reviewType]}
            </span>
            <span
              className="pill"
              style={{
                padding: "3px 10px",
                fontSize: 10,
                fontWeight: 600,
                background: review.reviewScope === "general" ? "#f1f1f4" : "#eef5ff",
                color: review.reviewScope === "general" ? MUTED : BLUE_TEXT,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                border: review.reviewScope === "general" ? "1px solid #e0e0e6" : "1px solid #c7dcfb",
              }}
            >
              {review.reviewScope === "general" ? "General" : "Enrollment"}
            </span>
            {review.overallRating != null && (
              <Stars value={review.overallRating} readOnly onChange={() => {}} />
            )}
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>
            {reviewDateStr}
            {showLogged && ` (logged ${createdAtStr})`}
            {review.createdByName ? ` · ${review.createdByName}` : ""}
            {review.createdByRole ? ` (${review.createdByRole})` : ""}
          </div>
        </div>
        {isManager && (
          <button
            type="button"
            onClick={() =>
              confirmDeleteTeacherReview(
                review.id,
                `${REVIEW_TYPE_LABEL[review.reviewType]} review for ${review.teacherUserName}`,
              )
            }
            style={{
              background: "none",
              border: "1px solid #e8e8ed",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 11,
              color: "#B71C1C",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Delete
          </button>
        )}
      </div>

      {/* Snapshot context — only for enrollment-scoped reviews. General
          reviews intentionally omit this since no enrollment is attached. */}
      {review.reviewScope === "enrollment" &&
       (review.subject || review.grade || review.curriculum || review.enrollmentId) && (
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
          {[review.subject, review.grade, review.curriculum].filter(Boolean).join(" · ") || "—"}
          {review.enrollmentId && (
            <>
              {" "}· enrollment <strong style={{ color: NEAR_BLACK, fontWeight: 500 }}>{review.enrollmentId}</strong>
              {review.studentUserName ? ` · ${review.studentUserName}` : ""}
            </>
          )}
        </div>
      )}

      {/* Summary */}
      {review.summary && (
        <p style={{ fontSize: 13, lineHeight: 1.47, color: NEAR_BLACK, margin: "0 0 10px" }}>
          {review.summary}
        </p>
      )}

      {/* Rubric grid */}
      {rubric.length > 0 && Object.keys(review.reviewData ?? {}).length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 8,
          marginBottom: review.studentVerbatim || review.improvementNotes ? 10 : 0,
        }}>
          {rubric.map((q) => {
            const a = review.reviewData?.[q.key];
            if (!a || a.value === null || a.value === undefined) return null;
            return (
              <div key={q.key} style={{
                background: "#f9f9fb",
                border: "1px solid #ececef",
                borderRadius: 8,
                padding: "8px 10px",
              }}>
                <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  {q.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: NEAR_BLACK }}>
                  {formatRubricValue(q.type, a.value, q.scoreMax ?? 5, q.choices)}
                </div>
                {a.note && (
                  <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic", marginTop: 4 }}>
                    {a.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Verbatim (Student only) */}
      {review.studentVerbatim && (
        <blockquote style={{
          margin: "0 0 10px",
          padding: "10px 14px",
          borderLeft: `3px solid ${REVIEW_TYPE_COLOR.student}`,
          background: "#f6fbf7",
          fontSize: 13,
          fontStyle: "italic",
          color: NEAR_BLACK,
          lineHeight: 1.47,
          borderRadius: "0 8px 8px 0",
        }}>
          &ldquo;{review.studentVerbatim}&rdquo;
        </blockquote>
      )}

      {/* Improvement notes */}
      {review.improvementNotes && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
            Improvement notes
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.47, color: NEAR_BLACK, margin: 0 }}>
            {review.improvementNotes}
          </p>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  // review_date arrives as "YYYY-MM-DD" (no time); created_at as full ISO.
  // Treat both consistently — Date parses YYYY-MM-DD as UTC midnight which is
  // fine for display.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sameDay(a: string, b: string): boolean {
  if (!a || !b) return false;
  // Normalise to YYYY-MM-DD for the comparison so back-dating logic doesn't
  // false-positive on timezone drift.
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}

function formatRubricValue(
  type: "score" | "yesno" | "choice" | "text",
  value: unknown,
  scoreMax: number,
  choices?: { value: string; label: string }[],
): string {
  if (type === "score") {
    return typeof value === "number" ? `${value}/${scoreMax}` : "—";
  }
  if (type === "yesno") {
    if (value === true) return "Yes";
    if (value === false) return "No";
    return "—";
  }
  if (type === "choice") {
    const c = choices?.find((c) => c.value === value);
    return c?.label ?? (typeof value === "string" ? value : "—");
  }
  return typeof value === "string" ? value : "—";
}
