"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Stars } from "@/components/ui";
import {
  BLUE,
  LIGHT_GRAY,
  MUTED,
  NEAR_BLACK,
  POUR_CATS,
  type Demo,
  type DemoDraft,
} from "@/lib/types";

type FieldKey =
  | "pour_issues"
  | "methodology"
  | "topic"
  | "resources"
  | "engagement"
  | "effectiveness"
  | "suggested_rating"
  | "suggestions"
  | "improvement_focus";

const FIELD_ORDER: FieldKey[] = [
  "pour_issues",
  "methodology",
  "topic",
  "resources",
  "engagement",
  "effectiveness",
  "suggested_rating",
  "suggestions",
  "improvement_focus",
];

const FIELD_LABELS: Record<FieldKey, string> = {
  pour_issues: "POUR issues",
  methodology: "Methodology",
  topic: "Topic fit",
  resources: "Resources",
  engagement: "Engagement",
  effectiveness: "Effectiveness",
  suggested_rating: "Suggested rating",
  suggestions: "Suggestions",
  improvement_focus: "Improvement focus",
};

type FieldState = "untouched" | "accepted" | "edited";

type PourEntry = { category: string; description: string };

interface DraftState {
  pour_issues: PourEntry[];
  methodology: string;
  topic: string;
  resources: string;
  engagement: string;
  effectiveness: string;
  suggested_rating: number;
  suggestions: string;
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
  const { setDemos, approveDraft, rejectDraft, logActivity, flash, user } =
    useStore();

  // Seed from the AI draft — user edits live in this local state
  const [values, setValues] = useState<DraftState>(() => ({
    pour_issues: draft.draft_data.pour_issues.map((p) => ({ ...p })),
    methodology: draft.draft_data.methodology,
    topic: draft.draft_data.topic,
    resources: draft.draft_data.resources,
    engagement: draft.draft_data.engagement,
    effectiveness: draft.draft_data.effectiveness,
    suggested_rating: draft.draft_data.suggested_rating,
    suggestions: draft.draft_data.suggestions,
    improvement_focus: draft.draft_data.improvement_focus,
  }));

  const [states, setStates] = useState<Record<FieldKey, FieldState>>(() =>
    FIELD_ORDER.reduce((acc, k) => ({ ...acc, [k]: "untouched" }), {} as Record<FieldKey, FieldState>)
  );

  const [submitting, setSubmitting] = useState(false);

  const acceptAll = () =>
    setStates(
      FIELD_ORDER.reduce(
        (acc, k) => ({ ...acc, [k]: "accepted" }),
        {} as Record<FieldKey, FieldState>
      )
    );

  const setState = (k: FieldKey, s: FieldState) =>
    setStates((prev) => ({ ...prev, [k]: s }));

  const setValue = <K extends FieldKey>(k: K, v: DraftState[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const allDecided = useMemo(
    () => FIELD_ORDER.every((k) => states[k] !== "untouched"),
    [states]
  );

  const approvalRate = useMemo(() => {
    const accepted = FIELD_ORDER.filter((k) => states[k] === "accepted").length;
    return accepted / FIELD_ORDER.length;
  }, [states]);

  const anyEdited = useMemo(
    () => FIELD_ORDER.some((k) => states[k] === "edited"),
    [states]
  );

  const submit = async () => {
    if (!allDecided || submitting) return;
    setSubmitting(true);
    try {
      // Map draft values → demo fields and persist via the store's wrapped setDemos
      setDemos((prev) =>
        prev.map((d) =>
          d.id === demo.id
            ? {
                ...d,
                pour: values.pour_issues.map((p) => ({
                  cat: p.category,
                  desc: p.description,
                })),
                methodology: values.methodology,
                engagement: values.engagement,
                topicReview: values.topic,
                resourcesReview: values.resources,
                effectivenessReview: values.effectiveness,
                analystRating: values.suggested_rating,
                suggestions: values.suggestions,
                improvement: values.improvement_focus,
              }
            : d
        )
      );
      const finalStatus = anyEdited ? "partially_edited" : "approved";
      await approveDraft(draft.id, approvalRate, finalStatus);
      logActivity(
        "reviewed AI draft",
        user?.full_name ?? "Analyst",
        `${demo.student} (${Math.round(approvalRate * 100)}% accepted)`
      );
      flash("Draft submitted — demo updated");
      router.push("/");
    } finally {
      setSubmitting(false);
    }
  };

  const onReject = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await rejectDraft(draft.id);
      logActivity(
        "rejected AI draft",
        user?.full_name ?? "Analyst",
        demo.student
      );
      flash("AI draft rejected — writing review manually");
      // Pre-fill the blank analyst form with the demo metadata
      const params = new URLSearchParams({
        student: demo.student,
        teacher: demo.teacher,
        level: demo.level,
        subject: demo.subject,
      });
      router.push(`/analyst?${params.toString()}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render helpers ────────────────────────────────────────────
  const borderFor = (k: FieldKey): string => {
    if (states[k] === "accepted") return "3px solid #30D158";
    if (states[k] === "edited") return "3px solid #FF9F0A";
    return "3px solid #e8e8ed";
  };

  const ToggleButtons = ({ k }: { k: FieldKey }) => (
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

  const locked = (k: FieldKey) => states[k] !== "edited";

  const FieldHeader = ({ k }: { k: FieldKey }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 6,
      }}
    >
      <span className="section-label">
        {FIELD_LABELS[k]}{" "}
        <span style={{ color: BLUE, marginLeft: 6, letterSpacing: 0.5 }}>AI DRAFT</span>
      </span>
      <ToggleButtons k={k} />
    </div>
  );

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
      {/* LEFT — AI draft with per-field controls */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <p className="section-label">Review AI draft</p>
          <button
            type="button"
            onClick={acceptAll}
            className="pill pill-outline"
            style={{ padding: "6px 14px", fontSize: 13 }}
          >
            Accept all
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* POUR issues */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e8e8ed",
              borderLeft: borderFor("pour_issues"),
              padding: "14px 18px",
              transition: "all 0.15s",
            }}
          >
            <FieldHeader k="pour_issues" />
            {locked("pour_issues") ? (
              values.pour_issues.length === 0 ? (
                <p style={{ fontSize: 13, color: MUTED, fontStyle: "italic" }}>
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
                {POUR_CATS.map((cat) => {
                  const existing = values.pour_issues.find((p) => p.category === cat);
                  const checked = !!existing;
                  return (
                    <div key={cat}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "6px 12px",
                          borderRadius: 10,
                          background: checked ? "#FFF3E0" : LIGHT_GRAY,
                          border: "1px solid " + (checked ? "#E8A040" : "#e8e8ed"),
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 500,
                          color: checked ? "#8B5000" : "#1d1d1f",
                        }}
                      >
                        <input
                          type="checkbox"
                          className="apple-checkbox"
                          checked={checked}
                          onChange={() => {
                            if (checked) {
                              setValue(
                                "pour_issues",
                                values.pour_issues.filter((p) => p.category !== cat)
                              );
                            } else {
                              setValue("pour_issues", [
                                ...values.pour_issues,
                                { category: cat, description: "" },
                              ]);
                            }
                          }}
                        />
                        {cat}
                      </label>
                      {checked && (
                        <input
                          className="apple-input"
                          style={{ marginTop: 4, fontSize: 13 }}
                          placeholder={`Describe the ${cat.toLowerCase()} issue…`}
                          value={existing!.description}
                          onChange={(e) =>
                            setValue(
                              "pour_issues",
                              values.pour_issues.map((p) =>
                                p.category === cat
                                  ? { ...p, description: e.target.value }
                                  : p
                              )
                            )
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Text fields — methodology, topic, resources, engagement, effectiveness, suggestions, improvement_focus */}
          {(
            [
              "methodology",
              "topic",
              "resources",
              "engagement",
              "effectiveness",
              "suggestions",
              "improvement_focus",
            ] as const
          ).map((k) => (
            <div
              key={k}
              style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e8e8ed",
                borderLeft: borderFor(k),
                padding: "14px 18px",
                transition: "all 0.15s",
              }}
            >
              <FieldHeader k={k} />
              {locked(k) ? (
                <p style={{ fontSize: 14, lineHeight: 1.47, color: NEAR_BLACK }}>
                  {values[k] || <span style={{ color: MUTED, fontStyle: "italic" }}>(empty)</span>}
                </p>
              ) : (
                <textarea
                  className="apple-input apple-textarea"
                  value={values[k]}
                  onChange={(e) => setValue(k, e.target.value)}
                  rows={3}
                />
              )}
            </div>
          ))}

          {/* Suggested rating */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e8e8ed",
              borderLeft: borderFor("suggested_rating"),
              padding: "14px 18px",
              transition: "all 0.15s",
            }}
          >
            <FieldHeader k="suggested_rating" />
            <Stars
              value={values.suggested_rating}
              onChange={(v) => setValue("suggested_rating", v)}
              readOnly={locked("suggested_rating")}
            />
          </div>
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
              {submitting ? "Submitting…" : "Submit review"}
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
