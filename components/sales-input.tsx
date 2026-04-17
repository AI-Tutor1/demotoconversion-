"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Field } from "@/components/ui";
import { ACCT_TYPES, MUTED, BLUE, NEAR_BLACK, type Demo } from "@/lib/types";

// ─── Inline UI helpers ────────────────────────────────────────────────────────

function RatingPills({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 980,
              border: "1px solid " + (active ? BLUE : "#e8e8ed"),
              background: active ? BLUE : "#fff",
              color: active ? "#fff" : NEAR_BLACK,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  const baseBtn = (active: boolean, color: string, label: string, val: boolean) => (
    <button
      type="button"
      onClick={() => onChange(val)}
      style={{
        padding: "5px 18px",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 980,
        border: "1px solid " + (active ? color : "#e8e8ed"),
        background: active ? color : "#fff",
        color: active ? "#fff" : MUTED,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {baseBtn(value === true, "#30D158", "Yes", true)}
      {baseBtn(value === false, "#E24B4A", "No", false)}
    </div>
  );
}

function FeedbackQ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e8e8ed",
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 12,
      }}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: NEAR_BLACK,
          lineHeight: 1.47,
          marginBottom: 10,
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

// ─── Sales form state shape ───────────────────────────────────────────────────

interface SalesForm {
  status: "Converted" | "Not Converted" | "Pending";
  salesAgentId: string;
  marketing: boolean;
  acctType: string;
  link: string;
  feedbackRating: number;
  feedbackExplanation: boolean | null;
  feedbackExplanationComment: string;
  feedbackParticipation: boolean | null;
  feedbackParticipationComment: string;
  feedbackConfused: boolean | null;
  feedbackConfusedDetail: string;
  feedbackUncomfortable: boolean | null;
  feedbackUncomfortableDetail: string;
  feedbackPositiveEnv: boolean | null;
  feedbackPositiveEnvComment: string;
  feedbackSuggestions: string;
  feedbackComments: string;
}

const blankSF: SalesForm = {
  status: "Converted",
  salesAgentId: "",
  marketing: false,
  acctType: "",
  link: "",
  feedbackRating: 0,
  feedbackExplanation: null,
  feedbackExplanationComment: "",
  feedbackParticipation: null,
  feedbackParticipationComment: "",
  feedbackConfused: null,
  feedbackConfusedDetail: "",
  feedbackUncomfortable: null,
  feedbackUncomfortableDetail: "",
  feedbackPositiveEnv: null,
  feedbackPositiveEnvComment: "",
  feedbackSuggestions: "",
  feedbackComments: "",
};

function fromDemo(d: Demo): SalesForm {
  return {
    status: d.status,
    salesAgentId: d.salesAgentId ?? "",
    marketing: d.marketing,
    acctType: d.acctType,
    link: d.link,
    feedbackRating: d.feedbackRating,
    feedbackExplanation: d.feedbackExplanation,
    feedbackExplanationComment: d.feedbackExplanationComment,
    feedbackParticipation: d.feedbackParticipation,
    feedbackParticipationComment: d.feedbackParticipationComment,
    feedbackConfused: d.feedbackConfused,
    feedbackConfusedDetail: d.feedbackConfusedDetail,
    feedbackUncomfortable: d.feedbackUncomfortable,
    feedbackUncomfortableDetail: d.feedbackUncomfortableDetail,
    feedbackPositiveEnv: d.feedbackPositiveEnv,
    feedbackPositiveEnvComment: d.feedbackPositiveEnvComment,
    feedbackSuggestions: d.feedbackSuggestions,
    feedbackComments: d.feedbackComments,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SalesInputProps {
  demo: Demo;
}

export default function SalesInput({ demo }: SalesInputProps) {
  const router = useRouter();
  const { setDemos, setConfirm, logActivity, flash, salesAgents } = useStore();
  const [sf, setSf] = useState<SalesForm>(() => fromDemo(demo));

  // Re-initialize when navigating to a different demo
  useEffect(() => {
    setSf(fromDemo(demo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.id]);

  const suggestedAcct = useMemo(() => {
    if (demo.analystRating <= 2 || demo.pour.length > 0) return "Product";
    if (demo.analystRating >= 4 && demo.studentRaw >= 7) return "Sales";
    return "Consumer";
  }, [demo.analystRating, demo.pour, demo.studentRaw]);

  const handleSubmit = () => {
    if (sf.feedbackConfused === true && !sf.feedbackConfusedDetail.trim()) {
      flash("Please describe the confusion moments.");
      return;
    }
    if (sf.feedbackUncomfortable === true && !sf.feedbackUncomfortableDetail.trim()) {
      flash("Please describe the uncomfortable moments.");
      return;
    }
    const selectedAgent = salesAgents.find((a) => a.id === sf.salesAgentId);
    const agentName = selectedAgent?.full_name ?? "";
    const nextStage =
      sf.status === "Converted"
        ? ("converted" as const)
        : sf.status === "Not Converted"
        ? ("lost" as const)
        : ("under_review" as const);

    setConfirm({
      title: "Mark as " + sf.status + "?",
      msg: "Save sales feedback for " + demo.student + ".",
      onConfirm: () => {
        setDemos((p) =>
          p.map((d) =>
            d.id === demo.id
              ? {
                  ...d,
                  status: sf.status,
                  agent: agentName,
                  salesAgentId: sf.salesAgentId || null,
                  link: sf.link,
                  acctType: sf.acctType,
                  marketing: sf.marketing,
                  workflowStage: nextStage,
                  feedbackRating: sf.feedbackRating,
                  feedbackExplanation: sf.feedbackExplanation,
                  feedbackExplanationComment: sf.feedbackExplanationComment,
                  feedbackParticipation: sf.feedbackParticipation,
                  feedbackParticipationComment: sf.feedbackParticipationComment,
                  feedbackConfused: sf.feedbackConfused,
                  feedbackConfusedDetail: sf.feedbackConfusedDetail,
                  feedbackUncomfortable: sf.feedbackUncomfortable,
                  feedbackUncomfortableDetail: sf.feedbackUncomfortableDetail,
                  feedbackPositiveEnv: sf.feedbackPositiveEnv,
                  feedbackPositiveEnvComment: sf.feedbackPositiveEnvComment,
                  feedbackSuggestions: sf.feedbackSuggestions,
                  feedbackComments: sf.feedbackComments,
                }
              : d
          )
        );
        logActivity(
          sf.status === "Converted"
            ? "converted"
            : sf.status === "Not Converted"
            ? "marked not converted"
            : "updated",
          demo.student
        );
        flash("Sales feedback saved");
        router.push("/");
      },
    });
  };

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ maxWidth: 640 }}>
        <div className="section-label" style={{ marginBottom: 6 }}>Sales input</div>
        <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>Follow-up &amp; conversion</h2>

        {/* Status + Agent row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <Field label="Conversion status">
            <select
              className="apple-input apple-select"
              value={sf.status}
              onChange={(e) => setSf((p) => ({ ...p, status: e.target.value as SalesForm["status"] }))}
            >
              <option>Converted</option>
              <option>Not Converted</option>
              <option>Pending</option>
            </select>
          </Field>
          <Field label="Sales agent">
            <select
              className="apple-input apple-select"
              value={sf.salesAgentId}
              onChange={(e) => setSf((p) => ({ ...p, salesAgentId: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {salesAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Q1 — Overall experience 1-10 */}
        <FeedbackQ label="On a scale of 1-10, how would you rate your overall experience during this session?">
          <RatingPills value={sf.feedbackRating} onChange={(v) => setSf((p) => ({ ...p, feedbackRating: v }))} />
        </FeedbackQ>

        {/* Q2 — Topic explanation */}
        <FeedbackQ label="Did the tutor effectively explain the topic or concept during the session?">
          <YesNoToggle value={sf.feedbackExplanation} onChange={(v) => setSf((p) => ({ ...p, feedbackExplanation: v }))} />
          <textarea
            className="apple-input apple-textarea"
            placeholder="Optional comment…"
            style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
            value={sf.feedbackExplanationComment}
            onChange={(e) => setSf((p) => ({ ...p, feedbackExplanationComment: e.target.value }))}
          />
        </FeedbackQ>

        {/* Q3 — Active participation */}
        <FeedbackQ label="Were you able to actively participate and ask questions during the session?">
          <YesNoToggle value={sf.feedbackParticipation} onChange={(v) => setSf((p) => ({ ...p, feedbackParticipation: v }))} />
          <textarea
            className="apple-input apple-textarea"
            placeholder="Optional comment…"
            style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
            value={sf.feedbackParticipationComment}
            onChange={(e) => setSf((p) => ({ ...p, feedbackParticipationComment: e.target.value }))}
          />
        </FeedbackQ>

        {/* Q4 — Confusion (required if Yes) */}
        <FeedbackQ label="Were there any moments during the session when you felt confused or lost? If yes, please describe.">
          <YesNoToggle value={sf.feedbackConfused} onChange={(v) => setSf((p) => ({ ...p, feedbackConfused: v }))} />
          {sf.feedbackConfused === true && (
            <textarea
              className="apple-input apple-textarea"
              placeholder="Required — describe the confusion…"
              style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
              value={sf.feedbackConfusedDetail}
              onChange={(e) => setSf((p) => ({ ...p, feedbackConfusedDetail: e.target.value }))}
            />
          )}
        </FeedbackQ>

        {/* Q5 — Uncomfortable (required if Yes) */}
        <FeedbackQ label="Any moments where you felt uncomfortable during the session?">
          <YesNoToggle value={sf.feedbackUncomfortable} onChange={(v) => setSf((p) => ({ ...p, feedbackUncomfortable: v }))} />
          {sf.feedbackUncomfortable === true && (
            <textarea
              className="apple-input apple-textarea"
              placeholder="Required — describe what was uncomfortable…"
              style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
              value={sf.feedbackUncomfortableDetail}
              onChange={(e) => setSf((p) => ({ ...p, feedbackUncomfortableDetail: e.target.value }))}
            />
          )}
        </FeedbackQ>

        {/* Q6 — Positive environment */}
        <FeedbackQ label="Did the tutor create a positive learning environment?">
          <YesNoToggle value={sf.feedbackPositiveEnv} onChange={(v) => setSf((p) => ({ ...p, feedbackPositiveEnv: v }))} />
          <textarea
            className="apple-input apple-textarea"
            placeholder="Optional comment…"
            style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
            value={sf.feedbackPositiveEnvComment}
            onChange={(e) => setSf((p) => ({ ...p, feedbackPositiveEnvComment: e.target.value }))}
          />
        </FeedbackQ>

        {/* Q7 — Suggestions */}
        <FeedbackQ label="Do you have any suggestions for improvement or specific feedback for the tutor or the platform?">
          <textarea
            className="apple-input apple-textarea"
            placeholder="Open-ended…"
            style={{ fontSize: 13, minHeight: 70 }}
            value={sf.feedbackSuggestions}
            onChange={(e) => setSf((p) => ({ ...p, feedbackSuggestions: e.target.value }))}
          />
        </FeedbackQ>

        {/* Q8 — Comments / Others */}
        <FeedbackQ label="Comments / Others">
          <textarea
            className="apple-input apple-textarea"
            placeholder="Anything else worth recording…"
            style={{ fontSize: 13, minHeight: 70 }}
            value={sf.feedbackComments}
            onChange={(e) => setSf((p) => ({ ...p, feedbackComments: e.target.value }))}
          />
        </FeedbackQ>

        {/* Reference link */}
        <Field label="Link">
          <input
            className="apple-input"
            placeholder="https://..."
            value={sf.link}
            onChange={(e) => setSf((p) => ({ ...p, link: e.target.value }))}
          />
        </Field>

        {/* Accountability (when Not Converted) */}
        {sf.status === "Not Converted" && (
          <div style={{ background: "#FFF8E1", borderRadius: 12, padding: "14px 18px", marginTop: 8, border: "1px solid #F5D98E" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#8B6914", textTransform: "uppercase", marginBottom: 6 }}>Step 10 — Accountability</div>
            {suggestedAcct && (
              <p style={{ fontSize: 12, color: "#8B6914", marginBottom: 8 }}>
                Suggested: <strong>{suggestedAcct}</strong>
              </p>
            )}
            <select
              className="apple-input apple-select"
              value={sf.acctType}
              onChange={(e) => setSf((p) => ({ ...p, acctType: e.target.value }))}
            >
              <option value="">Select type...</option>
              {ACCT_TYPES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        )}

        {/* Marketing toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
          <input
            type="checkbox"
            className="apple-checkbox"
            checked={sf.marketing}
            onChange={(e) => setSf((p) => ({ ...p, marketing: e.target.checked }))}
          />
          <span style={{ fontSize: 14 }}>Marketing lead</span>
        </div>

        {/* Submit button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="pill pill-blue" style={{ padding: "10px 24px", fontSize: 15 }} onClick={handleSubmit}>
            Update demo
          </button>
        </div>
      </div>
    </div>
  );
}
