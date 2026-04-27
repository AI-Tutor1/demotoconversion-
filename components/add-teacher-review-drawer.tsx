"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Stars } from "@/components/ui";
import { RubricQuestion } from "@/components/rubric";
import { SearchableSelect } from "@/components/searchable-select";
import {
  BLUE,
  LIGHT_GRAY,
  MUTED,
  NEAR_BLACK,
  RUBRIC_BY_TYPE,
  REVIEW_TYPE_LABEL,
  REVIEW_TYPE_COLOR,
  type ReviewType,
  type ReviewScope,
  type RubricAnswerValue,
  type EnrollmentLookupLite,
  type EnrollmentSummary,
  type RecentSessionLite,
} from "@/lib/types";

interface Props {
  teacherUserId: string;
  teacherUserName: string;
  onClose: () => void;
  onSubmitted: (id: string) => void;
}

type Answer = { value: RubricAnswerValue; note?: string };

const REVIEW_TYPES: { key: ReviewType; label: string; description: string }[] = [
  { key: "product",    label: "Product",    description: "Free-form QA review of teaching quality" },
  { key: "student",    label: "Student",    description: "Student-voiced feedback (verbatim required)" },
  { key: "excellence", label: "Excellence", description: "Scheduling, punctuality, reliability" },
];

export default function AddTeacherReviewDrawer({
  teacherUserId,
  teacherUserName,
  onClose,
  onSubmitted,
}: Props) {
  const { addTeacherReview, lookupEnrollmentForReview, listEnrollmentsForTeacher, setConfirm, flash } = useStore();

  const [reviewType, setReviewType] = useState<ReviewType>("product");
  const [reviewScope, setReviewScope] = useState<ReviewScope>("enrollment");
  const [reviewDate, setReviewDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  // Enrollment dropdown — populated from list_enrollments_for_teacher RPC
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [enrollmentsLoaded, setEnrollmentsLoaded] = useState(false);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [enrollmentsError, setEnrollmentsError] = useState<string | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  // Resolved enrollment + recent sessions, populated after the user picks
  // from the dropdown (auto-lookup on select).
  const [enrollment, setEnrollment] = useState<EnrollmentLookupLite | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSessionLite[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [rubricAnswers, setRubricAnswers] = useState<Record<string, Answer>>({});
  const [verbatim, setVerbatim] = useState("");
  const [summary, setSummary] = useState("");
  const [improvementNotes, setImprovementNotes] = useState("");
  const [overallRating, setOverallRating] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Student reviews are always enrollment-scoped (it's the student's voice
  // from a class). Hide the toggle for Student; if the user already had
  // 'general' selected and switches type to Student, force back to enrollment.
  const scopeToggleVisible = reviewType !== "student";
  const rubric = RUBRIC_BY_TYPE[reviewType];

  // Rubric is enabled when scope='general' (no lookup needed) or when an
  // enrollment lookup has succeeded.
  const enrollmentReady = reviewScope === "general" || !!enrollment;

  // Reset state when review type changes — keep enrollment lookup if already
  // resolved, but force scope back to enrollment for Student.
  const handleTypeChange = (next: ReviewType) => {
    if (next === reviewType) return;
    setReviewType(next);
    setRubricAnswers({});
    if (next === "student") {
      setReviewScope("enrollment");
    }
    setSelectedSessionId(null);
    setDirty(true);
  };

  const handleScopeChange = (next: ReviewScope) => {
    if (next === reviewScope) return;
    setReviewScope(next);
    setDirty(true);
    if (next === "general") {
      // Discard any enrollment lookup that's already resolved — General
      // reviews don't carry an enrollment context. Keep the cached
      // enrollments list (no point refetching if user toggles back).
      setSelectedEnrollmentId("");
      setEnrollment(null);
      setRecentSessions([]);
      setSelectedSessionId(null);
      setLookupError(null);
    }
  };

  // Fetch this teacher's enrollments once when the drawer is opened in
  // enrollment scope. Cached for the rest of the drawer's lifetime so
  // toggling scope back and forth doesn't refetch.
  useEffect(() => {
    if (reviewScope !== "enrollment") return;
    if (enrollmentsLoaded || enrollmentsLoading) return;
    setEnrollmentsLoading(true);
    setEnrollmentsError(null);
    listEnrollmentsForTeacher(teacherUserId).then((res) => {
      setEnrollmentsLoading(false);
      setEnrollmentsLoaded(true);
      if (!res.ok) {
        setEnrollmentsError(res.error);
        return;
      }
      setEnrollments(res.enrollments);
    });
  }, [reviewScope, enrollmentsLoaded, enrollmentsLoading, listEnrollmentsForTeacher, teacherUserId]);

  // When the user picks an enrollment from the dropdown, automatically
  // fetch its full context + 5 most recent sessions. No manual button.
  const handleEnrollmentSelect = useCallback(async (id: string) => {
    setSelectedEnrollmentId(id);
    setDirty(true);
    setSelectedSessionId(null);
    if (!id) {
      setEnrollment(null);
      setRecentSessions([]);
      setLookupError(null);
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setEnrollment(null);
    setRecentSessions([]);
    const res = await lookupEnrollmentForReview(id);
    setLookupLoading(false);
    if (!res.ok) {
      setLookupError(res.error);
      return;
    }
    setEnrollment(res.enrollment);
    setRecentSessions(res.recentSessions);
  }, [lookupEnrollmentForReview]);

  const enrollmentOptions = useMemo(
    () => enrollments.map((e) => ({
      value: e.enrollmentId,
      label: [e.enrollmentId, e.subject, e.studentName, e.grade]
        .filter(Boolean)
        .join(" · "),
    })),
    [enrollments]
  );

  const updateAnswer = (key: string, patch: Partial<Answer>) => {
    setDirty(true);
    setRubricAnswers((prev) => {
      const existing = prev[key] ?? { value: null as RubricAnswerValue };
      return {
        ...prev,
        [key]: { ...existing, ...patch },
      };
    });
  };

  // Validation: every rubric question with `requireNoteWhen(value) === true`
  // must have a non-empty note. Mirrors the RubricQuestion's red-state logic.
  const missingRequiredNotes = useMemo(() => {
    for (const q of rubric) {
      const a = rubricAnswers[q.key];
      if (!a) continue;
      const required = q.requireNoteWhen ? q.requireNoteWhen(a.value) : false;
      if (required && !(a.note ?? "").trim()) return true;
    }
    return false;
  }, [rubric, rubricAnswers]);

  const canSubmit =
    !submitting &&
    enrollmentReady &&
    !!reviewDate &&
    summary.trim().length > 0 &&
    (reviewType !== "student" || verbatim.trim().length > 0) &&
    !missingRequiredNotes;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const res = await addTeacherReview({
      reviewType,
      reviewScope,
      reviewDate,
      teacherUserId,
      teacherUserName,
      enrollmentId: reviewScope === "enrollment" ? (enrollment?.enrollmentId ?? null) : null,
      sessionId: reviewScope === "enrollment" ? selectedSessionId : null,
      overallRating: overallRating > 0 ? overallRating : null,
      summary: summary.trim(),
      improvementNotes: improvementNotes.trim(),
      studentVerbatim: verbatim.trim(),
      reviewData: rubricAnswers,
    });
    setSubmitting(false);
    if (res.ok) {
      flash("Review added");
      onSubmitted(res.id);
    }
  };

  const requestClose = useCallback(() => {
    if (!dirty) {
      onClose();
      return;
    }
    setConfirm({
      title: "Discard review?",
      msg: "You have unsaved changes. Closing will discard them.",
      onConfirm: () => onClose(),
    });
  }, [dirty, onClose, setConfirm]);

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [requestClose]);

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <div
        onClick={requestClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }}
      />
      <div
        className="animate-slide-in"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 720,
          background: "#fff",
          boxShadow: "-8px 0 28px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Add review</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                For <strong style={{ color: NEAR_BLACK, fontWeight: 500 }}>{teacherUserName}</strong>
              </div>
            </div>
            <button
              onClick={requestClose}
              aria-label="Close"
              style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Type selector */}
          <SectionLabel>Review type</SectionLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {REVIEW_TYPES.map((t) => {
              const active = t.key === reviewType;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleTypeChange(t.key)}
                  style={{
                    padding: "8px 14px",
                    border: active ? `1.5px solid ${REVIEW_TYPE_COLOR[t.key]}` : "1px solid #d2d2d7",
                    borderRadius: 10,
                    background: active ? REVIEW_TYPE_COLOR[t.key] : "#fff",
                    color: active ? "#fff" : NEAR_BLACK,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    minWidth: 110,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 18, fontStyle: "italic" }}>
            {REVIEW_TYPES.find((t) => t.key === reviewType)?.description}
          </div>

          {/* Scope toggle — Specific enrollment vs General. Hidden for Student
              (always enrollment) so the user doesn't see an option that would fail. */}
          {scopeToggleVisible && (
            <>
              <SectionLabel>Scope</SectionLabel>
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                {([
                  { key: "enrollment" as const, label: "Specific enrollment", description: "Tied to one enrollment" },
                  { key: "general"    as const, label: "General",             description: "About the teacher overall" },
                ]).map((s) => {
                  const active = s.key === reviewScope;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => handleScopeChange(s.key)}
                      style={{
                        flex: "0 0 auto",
                        padding: "8px 14px",
                        border: active ? `1.5px solid ${BLUE}` : "1px solid #d2d2d7",
                        borderRadius: 10,
                        background: active ? BLUE : "#fff",
                        color: active ? "#fff" : NEAR_BLACK,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        minWidth: 160,
                        textAlign: "left",
                      }}
                      title={s.description}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Review date — what date the review pertains to (the teaching event,
              not when the analyst is logging it). Defaults to today. */}
          <SectionLabel>
            Review date <span style={{ color: "#B71C1C" }}>*</span>
          </SectionLabel>
          <input
            type="date"
            className="apple-input"
            value={reviewDate}
            onChange={(e) => { setReviewDate(e.target.value); setDirty(true); }}
            max={new Date().toISOString().slice(0, 10)}
            style={{ fontSize: 13, marginBottom: 18, maxWidth: 200 }}
          />

          {/* Enrollment dropdown — only when scope is 'enrollment'. Lists
              all enrollments for this teacher (from list_enrollments_for_teacher
              RPC). On selection, full context + recent sessions auto-load. */}
          {reviewScope === "enrollment" && (
            <>
              <SectionLabel>Enrollment</SectionLabel>
              {enrollmentsLoading && !enrollmentsLoaded ? (
                <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic", marginBottom: 12 }}>
                  Loading enrollments…
                </div>
              ) : enrollmentsError ? (
                <div style={{ fontSize: 12, color: "#B71C1C", marginBottom: 12 }}>
                  Couldn&apos;t load enrollments: {enrollmentsError}
                </div>
              ) : enrollmentOptions.length === 0 ? (
                <div style={{
                  padding: "12px 14px",
                  background: LIGHT_GRAY,
                  borderRadius: 10,
                  border: "1px solid #e8e8ed",
                  marginBottom: 12,
                }}>
                  <div style={{ fontSize: 13, color: NEAR_BLACK, marginBottom: 8 }}>
                    No enrollments found for <strong>{teacherUserName}</strong>.
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
                    Switch to General scope to review the teacher overall.
                  </div>
                  <button
                    type="button"
                    onClick={() => handleScopeChange("general")}
                    className="pill pill-blue"
                    style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Switch to General
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: 8 }}>
                  <SearchableSelect
                    options={enrollmentOptions}
                    value={selectedEnrollmentId}
                    onChange={handleEnrollmentSelect}
                    placeholder={`Pick from ${enrollmentOptions.length} enrollment${enrollmentOptions.length === 1 ? "" : "s"}`}
                    clearLabel="No enrollment selected"
                    buttonClassName="apple-input apple-select"
                    width="100%"
                  />
                </div>
              )}
              {lookupLoading && (
                <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic", marginBottom: 8 }}>
                  Loading enrollment details…
                </div>
              )}
              {lookupError && (
                <div style={{ fontSize: 12, color: "#B71C1C", marginBottom: 12 }}>{lookupError}</div>
              )}
              {enrollment && (
                <EnrollmentContextCard enrollment={enrollment} />
              )}
              {enrollment && recentSessions.length > 0 && (
                <RecentSessionsList
                  sessions={recentSessions}
                  selectedId={selectedSessionId}
                  onSelect={(id) => { setSelectedSessionId(id); setDirty(true); }}
                />
              )}
              <div style={{ height: 18 }} />
            </>
          )}

          {/* Rubric */}
          <SectionLabel>
            {REVIEW_TYPE_LABEL[reviewType]} rubric
            {reviewScope === "general" && (
              <span style={{ color: MUTED, marginLeft: 8, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                · framed about the teacher overall
              </span>
            )}
          </SectionLabel>
          {!enrollmentReady ? (
            <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic", marginBottom: 18 }}>
              Look up an enrollment to enable the rubric (or switch to General scope).
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {rubric.map((q) => (
                <RubricQuestion
                  key={q.key}
                  q={q}
                  answer={rubricAnswers[q.key] ?? { value: null }}
                  onChange={(patch) => updateAnswer(q.key, patch as Partial<Answer>)}
                />
              ))}
            </div>
          )}

          {/* Student verbatim — required for Student reviews */}
          {reviewType === "student" && (
            <>
              <SectionLabel>
                Student verbatim <span style={{ color: "#B71C1C" }}>*</span>
              </SectionLabel>
              <textarea
                className="apple-input apple-textarea"
                rows={4}
                value={verbatim}
                onChange={(e) => { setVerbatim(e.target.value); setDirty(true); }}
                placeholder="What the student actually said about this teacher (their words, not your interpretation)"
                style={{ width: "100%", fontSize: 13, marginBottom: 18 }}
              />
            </>
          )}

          {/* Common fields */}
          <SectionLabel>Overall rating</SectionLabel>
          <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
            <Stars value={overallRating} onChange={(v) => { setOverallRating(v); setDirty(true); }} />
            {overallRating > 0 && (
              <button
                type="button"
                onClick={() => { setOverallRating(0); setDirty(true); }}
                style={{ background: "none", border: "none", color: BLUE, fontSize: 12, cursor: "pointer", padding: 0 }}
              >
                Clear
              </button>
            )}
          </div>

          <SectionLabel>
            Summary <span style={{ color: "#B71C1C" }}>*</span>
          </SectionLabel>
          <textarea
            className="apple-input apple-textarea"
            rows={3}
            value={summary}
            onChange={(e) => { setSummary(e.target.value); setDirty(true); }}
            placeholder="One-paragraph summary of this review"
            style={{ width: "100%", fontSize: 13, marginBottom: 18 }}
          />

          <SectionLabel>Improvement notes</SectionLabel>
          <textarea
            className="apple-input apple-textarea"
            rows={3}
            value={improvementNotes}
            onChange={(e) => { setImprovementNotes(e.target.value); setDirty(true); }}
            placeholder="Specific suggestions or follow-ups (optional)"
            style={{ width: "100%", fontSize: 13, marginBottom: 18 }}
          />
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #f0f0f0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={requestClose}
            className="pill pill-outline"
            style={{ padding: "8px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="pill pill-blue"
            style={{
              padding: "8px 22px",
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            {submitting ? "Saving…" : "Add review"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase",
      letterSpacing: "0.04em", marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function EnrollmentContextCard({ enrollment }: { enrollment: EnrollmentLookupLite }) {
  const paused =
    !!enrollment.pauseStarts &&
    (!enrollment.pauseEnds || new Date(enrollment.pauseEnds) >= new Date());
  return (
    <div style={{
      padding: "12px 14px",
      background: LIGHT_GRAY,
      borderRadius: 10,
      border: "1px solid #e8e8ed",
      marginBottom: 8,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {enrollment.studentName || "—"}
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
        Enrollment {enrollment.enrollmentId}
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 6, fontSize: 12,
      }}>
        <Field label="Subject"     value={enrollment.subject} />
        <Field label="Grade"       value={enrollment.grade} />
        <Field label="Curriculum"  value={enrollment.curriculum} />
        <Field label="Board"       value={enrollment.board} />
        <Field label="Status"      value={enrollment.enrollmentStatus} />
        {paused && (
          <Field
            label="Paused"
            value={enrollment.pauseStarts + (enrollment.pauseEnds ? ` → ${enrollment.pauseEnds}` : " (open)")}
          />
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: NEAR_BLACK, fontWeight: 500 }}>
        {value || "—"}
      </div>
    </div>
  );
}

function RecentSessionsList({
  sessions, selectedId, onSelect,
}: {
  sessions: RecentSessionLite[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <div style={{ marginTop: 4, marginBottom: 8 }}>
      <SectionLabel>Pin to a recent session (optional)</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SessionRow
          label="None"
          subtitle="Don't pin to a specific session"
          active={selectedId === null}
          onClick={() => onSelect(null)}
        />
        {sessions.map((s) => {
          const active = selectedId === s.id;
          const att =
            s.attendedStudent1 === true || s.attendedStudent2 === true
              ? "attended"
              : s.attendedStudent1 === false && s.attendedStudent2 === false
                ? "no-show"
                : "—";
          return (
            <SessionRow
              key={s.id}
              label={`${s.sessionDate ?? "—"} · ${s.classStatus || "—"}`}
              subtitle={`Attendance ${att}${s.notes ? " · " + s.notes.slice(0, 80) : ""}`}
              active={active}
              onClick={() => onSelect(active ? null : s.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function SessionRow({
  label, subtitle, active, onClick,
}: {
  label: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "8px 12px",
        background: active ? "#eef5ff" : "#fff",
        border: active ? `1.5px solid ${BLUE}` : "1px solid #e8e8ed",
        borderRadius: 8,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{
        width: 14, height: 14,
        borderRadius: "50%",
        border: active ? `4px solid ${BLUE}` : "1.5px solid #d2d2d7",
        flexShrink: 0,
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: NEAR_BLACK }}>{label}</div>
        <div style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtitle}
        </div>
      </div>
    </button>
  );
}
