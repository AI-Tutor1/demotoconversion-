"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  BLUE,
  LIGHT_GRAY,
  MUTED,
  NEAR_BLACK,
  POUR_CATS,
  type Demo,
  type DemoDraft,
  type ScoreEvidence,
} from "@/lib/types";
import {
  Q_KEYS,
  Q_META,
  type QKey,
  interpretationBadge,
  scoreColor,
  totalToAnalystRating,
} from "@/lib/scorecard";

// ─── Scorecard metadata ───────────────────────────────────────

type OtherKey = "pour_issues" | "overall_summary" | "improvement_suggestions" | "improvement_focus";

const ALL_KEYS: (QKey | OtherKey)[] = [
  ...Q_KEYS,
  "pour_issues",
  "overall_summary",
  "improvement_suggestions",
  "improvement_focus",
];

type FieldState = "untouched" | "accepted" | "edited";

// ─── Component ────────────────────────────────────────────────

type PourEntry = { category: string; description: string };

interface DraftState {
  q1_teaching_methodology: ScoreEvidence;
  q2_curriculum_alignment: ScoreEvidence;
  q3_student_interactivity: ScoreEvidence;
  q4_differentiated_teaching: ScoreEvidence;
  q5_psychological_safety: ScoreEvidence;
  q6_rapport_session_opening: ScoreEvidence;
  q7_technical_quality: ScoreEvidence;
  q8_formative_assessment: ScoreEvidence;
  pour_issues: PourEntry[];
  overall_summary: string;
  improvement_suggestions: string;
  improvement_focus: string;
}

export default function DraftReview({
  demo,
  draft,
}: {
  demo: Demo;
  draft: DemoDraft;
}) {
  const router = useRouter();
  const { setDemos, approveDraft, rejectDraft, triggerAnalyze, logActivity, flash } = useStore();

  const [values, setValues] = useState<DraftState>(() => ({
    q1_teaching_methodology:    { ...draft.draft_data.q1_teaching_methodology },
    q2_curriculum_alignment:    { ...draft.draft_data.q2_curriculum_alignment },
    q3_student_interactivity:   { ...draft.draft_data.q3_student_interactivity },
    q4_differentiated_teaching: { ...draft.draft_data.q4_differentiated_teaching },
    q5_psychological_safety:    { ...draft.draft_data.q5_psychological_safety },
    q6_rapport_session_opening: { ...draft.draft_data.q6_rapport_session_opening },
    q7_technical_quality:       { ...draft.draft_data.q7_technical_quality },
    q8_formative_assessment:    { ...draft.draft_data.q8_formative_assessment },
    pour_issues:                draft.draft_data.pour_issues.map((p) => ({ ...p })),
    overall_summary:            draft.draft_data.overall_summary,
    improvement_suggestions:    draft.draft_data.improvement_suggestions,
    improvement_focus:          draft.draft_data.improvement_focus,
  }));

  const [states, setStates] = useState<Record<QKey | OtherKey, FieldState>>(() =>
    ALL_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: "untouched" }),
      {} as Record<QKey | OtherKey, FieldState>
    )
  );

  const [submitting, setSubmitting] = useState(false);

  const setState = (k: QKey | OtherKey, s: FieldState) =>
    setStates((prev) => ({ ...prev, [k]: s }));

  const acceptAll = () =>
    setStates(
      ALL_KEYS.reduce(
        (acc, k) => ({ ...acc, [k]: "accepted" }),
        {} as Record<QKey | OtherKey, FieldState>
      )
    );

  // Live-recalculate total when analyst edits individual scores
  const totalScore = useMemo(
    () =>
      Q_KEYS.reduce((sum, k) => sum + (values[k].score || 0), 0),
    [values]
  );
  const badge = interpretationBadge(totalScore);

  const allDecided = useMemo(
    () => ALL_KEYS.every((k) => states[k] !== "untouched"),
    [states]
  );
  const approvalRate = useMemo(() => {
    const accepted = ALL_KEYS.filter((k) => states[k] === "accepted").length;
    return accepted / ALL_KEYS.length;
  }, [states]);
  const anyEdited = useMemo(
    () => ALL_KEYS.some((k) => states[k] === "edited"),
    [states]
  );

  const submit = async () => {
    if (submitting) return;
    if (!allDecided) {
      const undecided = ALL_KEYS.filter((k) => states[k] === "untouched").length;
      flash(`${undecided} field${undecided === 1 ? "" : "s"} still need Accept or Edit before submitting.`);
      return;
    }
    setSubmitting(true);
    try {
      // Map scorecard → flat demo columns (keeping scorecard itself in demo_drafts JSONB).
      setDemos((prev) =>
        prev.map((d) =>
          d.id === demo.id
            ? {
                ...d,
                pour: values.pour_issues.map((p) => ({ cat: p.category, desc: p.description })),
                review: values.overall_summary,
                suggestions: values.improvement_suggestions,
                improvement: values.improvement_focus,
                analystRating: totalToAnalystRating(totalScore),
                // Flip draft flag — demo is now fully reviewed and enters
                // the main pipeline (Dashboard, Kanban, Analytics, Teachers).
                isDraft: false,
                // Only advance the workflow if sales hasn't moved it yet —
                // re-editing after sales follow-up must not clobber their stage.
                workflowStage:
                  d.status === "Pending" ? "pending_sales" : d.workflowStage,
              }
            : d
        )
      );
      const finalStatus = anyEdited ? "partially_edited" : "approved";
      await approveDraft(draft.id, approvalRate, finalStatus);
      logActivity(
        "reviewed AI scorecard",
        `${demo.student} — ${totalScore}/32 ${badge.label}`
      );
      flash("Scorecard submitted — demo updated");
      router.push("/drafts");
    } finally {
      setSubmitting(false);
    }
  };

  const onReject = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await rejectDraft(draft.id);
      logActivity("rejected AI scorecard", demo.student);
      flash("AI draft rejected — writing review manually");
      // Pass tid alongside teacher name — tid disambiguates same-name teachers
      // (e.g. two "Muhammad Ebraheem" rows); teacher kept for display fallback.
      const params = new URLSearchParams({
        student: demo.student,
        teacher: demo.teacher,
        tid: String(demo.tid),
        level: demo.level,
        subject: demo.subject,
      });
      router.push(`/analyst?${params.toString()}`);
    } finally {
      setSubmitting(false);
    }
  };

  const onRedo = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await rejectDraft(draft.id);
      logActivity("requested AI redo", demo.student);
      flash("Regenerating AI draft — check the queue shortly...");
      // Fire-and-forget — navigate immediately, don't wait for AI
      triggerAnalyze(demo.id).then((result) => {
        if (!result.ok) {
          flash(`AI redo failed: ${result.error}`);
        }
      });
      router.push("/drafts");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render helpers ────────────────────────────────────────────
  const borderFor = (k: QKey | OtherKey): string => {
    if (states[k] === "accepted") return "3px solid #30D158";
    if (states[k] === "edited") return "3px solid #FF9F0A";
    return "3px solid #e8e8ed";
  };

  const ToggleButtons = ({ k }: { k: QKey | OtherKey }) => (
    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setState(k, "accepted")}
        style={{
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 980,
          border: "1px solid " + (states[k] === "accepted" ? "#30D158" : "#e8e8ed"),
          background: states[k] === "accepted" ? "#E8F5E9" : "#fff",
          color: states[k] === "accepted" ? "#1B5E20" : MUTED,
          cursor: "pointer",
        }}
      >
        ✓ Accept
      </button>
      <button
        type="button"
        onClick={() => setState(k, "edited")}
        style={{
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 980,
          border: "1px solid " + (states[k] === "edited" ? "#FF9F0A" : "#e8e8ed"),
          background: states[k] === "edited" ? "#FFF8E1" : "#fff",
          color: states[k] === "edited" ? "#8B6914" : MUTED,
          cursor: "pointer",
        }}
      >
        ✐ Edit
      </button>
    </div>
  );

  const locked = (k: QKey | OtherKey) => states[k] !== "edited";

  const QuestionCard = ({ k }: { k: QKey }) => {
    const meta = Q_META[k];
    const v = values[k];
    const color = scoreColor(v.score, meta.max);
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #e8e8ed",
          borderLeft: borderFor(k),
          borderRadius: 12,
          padding: "14px 18px",
          transition: "all 0.15s",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: NEAR_BLACK }}>
              {meta.label}
              <span style={{ fontSize: 11, color: MUTED, fontWeight: 400, marginLeft: 8 }}>
                {meta.scaleLabel}
              </span>
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 10,
                  color: BLUE,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                }}
              >
                AI DRAFT
              </span>
            </div>
          </div>
          <ToggleButtons k={k} />
        </div>

        {/* Score + evidence */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          {locked(k) ? (
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: color,
                color: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{v.score}</div>
              <div style={{ fontSize: 9, opacity: 0.85, marginTop: 2 }}>/ {meta.max}</div>
            </div>
          ) : (
            <input
              type="number"
              min={meta.min}
              max={meta.max}
              className="apple-input"
              value={v.score}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [k]: { ...prev[k], score: Number(e.target.value) },
                }))
              }
              style={{ width: 60, textAlign: "center", fontSize: 18, fontWeight: 700 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="section-label" style={{ marginBottom: 4 }}>Evidence</div>
            {locked(k) ? (
              <p style={{ fontSize: 13, color: NEAR_BLACK, lineHeight: 1.47, margin: 0 }}>
                {v.evidence || <span style={{ color: MUTED, fontStyle: "italic" }}>(no evidence cited)</span>}
              </p>
            ) : (
              <textarea
                className="apple-input apple-textarea"
                style={{ fontSize: 13, minHeight: 60 }}
                value={v.evidence}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [k]: { ...prev[k], evidence: e.target.value },
                  }))
                }
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  const TextCard = ({ k, label }: { k: OtherKey; label: string }) => {
    const v = values[k] as string;
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #e8e8ed",
          borderLeft: borderFor(k),
          borderRadius: 12,
          padding: "14px 18px",
          transition: "all 0.15s",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span className="section-label">
            {label}{" "}
            <span style={{ color: BLUE, marginLeft: 6, letterSpacing: 0.5 }}>AI DRAFT</span>
          </span>
          <ToggleButtons k={k} />
        </div>
        {locked(k) ? (
          <p style={{ fontSize: 14, lineHeight: 1.47, color: NEAR_BLACK, margin: 0 }}>
            {v || <span style={{ color: MUTED, fontStyle: "italic" }}>(empty)</span>}
          </p>
        ) : (
          <textarea
            className="apple-input apple-textarea"
            value={v}
            onChange={(e) => setValues((prev) => ({ ...prev, [k]: e.target.value }))}
            rows={3}
          />
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
        gap: 16,
        maxWidth: 1300,
        margin: "0 auto",
      }}
    >
      {/* LEFT — scorecard */}
      <div>
        {/* Total banner */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e8ed",
            borderRadius: 14,
            padding: "16px 20px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <p className="section-label">Total score</p>
            <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, color: NEAR_BLACK }}>
                {totalScore}
              </span>
              <span style={{ fontSize: 14, color: MUTED }}>/ 32</span>
              <span
                style={{
                  marginLeft: 10,
                  padding: "3px 12px",
                  borderRadius: 980,
                  fontSize: 12,
                  fontWeight: 600,
                  background: badge.bg,
                  color: badge.fg,
                }}
              >
                {badge.label}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={acceptAll}
            className="pill pill-outline"
            style={{ padding: "6px 14px", fontSize: 13 }}
          >
            Accept all
          </button>
        </div>

        {/* Q1-Q8 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Q_KEYS.map((k) => <QuestionCard key={k} k={k} />)}
        </div>

        {/* POUR issues */}
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e8e8ed",
              borderLeft: borderFor("pour_issues"),
              borderRadius: 12,
              padding: "14px 18px",
              transition: "all 0.15s",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span className="section-label">
                POUR issues{" "}
                <span style={{ color: BLUE, marginLeft: 6, letterSpacing: 0.5 }}>AI DRAFT</span>
              </span>
              <ToggleButtons k="pour_issues" />
            </div>
            {locked("pour_issues") ? (
              values.pour_issues.length === 0 ? (
                <p style={{ fontSize: 13, color: MUTED, fontStyle: "italic", margin: 0 }}>
                  No POUR issues flagged
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {values.pour_issues.map((p, i) => (
                    <div key={i}>
                      <span className="pour-tag">{p.category}</span>
                      {p.description && (
                        <span style={{ fontSize: 12, color: MUTED, marginLeft: 6 }}>
                          {p.description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {values.pour_issues.map((issue, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 8, alignItems: "center" }}>
                    <select
                      className="apple-input"
                      value={issue.category}
                      onChange={(e) => {
                        const updated = values.pour_issues.map((p, j) =>
                          j === i ? { ...p, category: e.target.value } : p
                        );
                        setValues((prev) => ({ ...prev, pour_issues: updated }));
                      }}
                    >
                      {POUR_CATS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      className="apple-input"
                      style={{ fontSize: 13 }}
                      placeholder="Describe the issue..."
                      value={issue.description}
                      onChange={(e) => {
                        const updated = values.pour_issues.map((p, j) =>
                          j === i ? { ...p, description: e.target.value } : p
                        );
                        setValues((prev) => ({ ...prev, pour_issues: updated }));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setValues((prev) => ({
                          ...prev,
                          pour_issues: prev.pour_issues.filter((_, j) => j !== i),
                        }))
                      }
                      style={{ fontSize: 18, color: MUTED, background: "none", border: "none", cursor: "pointer", padding: "0 6px", lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="pill pill-outline"
                  style={{ alignSelf: "flex-start", fontSize: 13, padding: "6px 14px" }}
                  onClick={() =>
                    setValues((prev) => ({
                      ...prev,
                      pour_issues: [...prev.pour_issues, { category: POUR_CATS[0], description: "" }],
                    }))
                  }
                >
                  + Add issue
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Text cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          <TextCard k="overall_summary" label="Overall summary" />
          <TextCard k="improvement_suggestions" label="Improvement suggestions" />
          <TextCard k="improvement_focus" label="Improvement focus" />
        </div>

        {/* Submit bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 20,
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onReject}
              className="pill pill-outline"
              style={{
                padding: "10px 22px",
                fontSize: 14,
                color: "#c13030",
                borderColor: "#c13030",
              }}
              disabled={submitting}
            >
              Reject draft
            </button>
            <button
              type="button"
              onClick={onRedo}
              className="pill pill-outline"
              style={{
                padding: "10px 22px",
                fontSize: 14,
              }}
              disabled={submitting}
            >
              Redo — regenerate
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 13, color: MUTED }}>
              {Math.round(approvalRate * 100)}% accepted
              {!allDecided && " · accept or edit every field to submit"}
            </span>
            <button
              type="button"
              onClick={submit}
              className="pill pill-blue"
              style={{
                padding: "10px 24px",
                fontSize: 15,
                opacity: !allDecided || submitting ? 0.5 : 1,
                cursor: !allDecided || submitting ? "not-allowed" : "pointer",
              }}
              disabled={!allDecided || submitting}
            >
              {submitting ? "Submitting…" : "Submit scorecard"}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT — transcript */}
      <div
        style={{
          background: LIGHT_GRAY,
          borderRadius: 16,
          padding: "16px 18px",
          height: "calc(100vh - 180px)",
          overflowY: "auto",
          position: "sticky",
          top: 92,
        }}
      >
        <p className="section-label" style={{ marginBottom: 10 }}>
          Transcript
        </p>
        {demo.transcript ? (
          <pre
            style={{
              fontSize: 12,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "ui-monospace, Menlo, monospace",
              color: NEAR_BLACK,
              margin: 0,
            }}
          >
            {demo.transcript}
          </pre>
        ) : (
          <p style={{ fontSize: 13, color: MUTED, fontStyle: "italic" }}>
            No transcript recorded for this demo.
          </p>
        )}
      </div>
    </div>
  );
}
