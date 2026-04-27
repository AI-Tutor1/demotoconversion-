"use client";
import { useState } from "react";
import { LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK } from "@/lib/types";
import type { RubricAnswerValue } from "@/lib/types";

// Structural shape used by RubricQuestion. Both HrInterviewQuestion and
// RubricQuestionDef are assignable to this — keep this minimal so callers
// can pass either without coercion.
export interface RubricQuestionLike {
  key: string;
  label: string;
  type: "score" | "yesno" | "choice" | "text";
  scoreMax?: number;
  lowLabel?: string;
  highLabel?: string;
  choices?: { value: string; label: string }[];
  hint?: string;
  requireNoteWhen?: (v: RubricAnswerValue) => boolean;
}

export interface RubricAnswerLike {
  value: RubricAnswerValue;
  note?: string;
}

interface RubricQuestionProps {
  q: RubricQuestionLike;
  answer: RubricAnswerLike;
  onChange: (patch: Partial<RubricAnswerLike>) => void;
}

/**
 * Single rubric question — picks a control based on q.type.
 *   score  → 1..N button scale with low/high anchor labels
 *   yesno  → two-pill toggle
 *   choice → select
 *   text   → textarea
 * Every non-text question gets an optional note textarea below; for questions
 * with `requireNoteWhen(value) === true`, the note becomes required (red border).
 *
 * Lifted from components/hr-interview-drawer.tsx so it can be reused by both
 * the HR interview drawer and the manual teacher-review drawer.
 */
export function RubricQuestion({ q, answer, onChange }: RubricQuestionProps) {
  const noteRequired = q.requireNoteWhen ? q.requireNoteWhen(answer.value) : false;
  const missingNote = noteRequired && !(answer.note ?? "").trim();
  const [showNote, setShowNote] = useState(
    !!(answer.note ?? "").trim() || noteRequired
  );

  const noteVisible = showNote || noteRequired;

  return (
    <div style={{
      padding: "10px 12px",
      background: LIGHT_GRAY,
      border: "1px solid #e8e8ed",
      borderRadius: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: NEAR_BLACK, flex: "1 1 auto", minWidth: 0 }}>
          {q.label}
        </div>

        {q.type === "score" && (
          <ScoreScale
            max={q.scoreMax ?? 5}
            value={typeof answer.value === "number" ? answer.value : null}
            onChange={(v) => onChange({ value: v })}
          />
        )}

        {q.type === "yesno" && (
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { v: true,  label: "Yes" },
              { v: false, label: "No" },
            ].map((opt) => {
              const active = answer.value === opt.v;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => onChange({ value: answer.value === opt.v ? null : opt.v })}
                  style={{
                    padding: "5px 14px",
                    border: active ? `1.5px solid ${BLUE}` : "1px solid #d2d2d7",
                    borderRadius: 8,
                    background: active ? BLUE : "#fff",
                    color: active ? "#fff" : NEAR_BLACK,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    minWidth: 52,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {q.type === "choice" && (
          <select
            className="apple-select"
            value={typeof answer.value === "string" ? answer.value : ""}
            onChange={(e) => onChange({ value: e.target.value || null })}
            style={{ maxWidth: 200, fontSize: 13 }}
          >
            <option value="">— select —</option>
            {(q.choices ?? []).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        )}
      </div>

      {q.type === "score" && (q.lowLabel || q.highLabel) && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: MUTED }}>
          <span>{q.lowLabel ?? ""}</span>
          <span>{q.highLabel ?? ""}</span>
        </div>
      )}

      {q.type === "text" && (
        <textarea
          className="apple-input apple-textarea"
          rows={3}
          value={typeof answer.value === "string" ? answer.value : ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={q.hint ?? ""}
          style={{ marginTop: 8, fontSize: 13, width: "100%" }}
        />
      )}

      {q.type !== "text" && q.hint && (
        <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic", marginTop: 6 }}>
          {q.hint}
        </div>
      )}

      {q.type !== "text" && !noteVisible && (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          style={{
            marginTop: 8,
            padding: 0,
            border: "none",
            background: "none",
            color: BLUE,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          + Add note
        </button>
      )}
      {q.type !== "text" && noteVisible && (
        <div style={{ marginTop: 8 }}>
          <textarea
            className="apple-input apple-textarea"
            rows={2}
            value={answer.note ?? ""}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder={noteRequired ? "Required — describe what you observed" : "Optional context"}
            style={{
              fontSize: 13,
              width: "100%",
              ...(missingNote ? { borderColor: "#B71C1C" } : {}),
            }}
          />
          {missingNote && (
            <div style={{ fontSize: 11, color: "#B71C1C", marginTop: 3 }}>
              Required
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact 1..N score scale. Fixed 34×30 buttons; blue when selected; click
 * the current value to clear (matches POUR tag toggle pattern). Per
 * memory/feedback_drawer_button_flex_overflow.md — never use flex:1 here.
 */
export function ScoreScale({
  max, value, onChange,
}: {
  max: number;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            aria-label={`Score ${n}`}
            style={{
              width: 34, height: 30,
              padding: 0,
              border: active ? `1.5px solid ${BLUE}` : "1px solid #d2d2d7",
              borderRadius: 7,
              background: active ? BLUE : "#fff",
              color: active ? "#fff" : NEAR_BLACK,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 120ms, color 120ms, border-color 120ms",
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
