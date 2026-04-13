"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { Field, Stars, SectionHeader } from "@/components/ui";
import { TEACHERS, LEVELS, SUBJECTS, POUR_CATS, LIGHT_GRAY, MUTED, BLUE } from "@/lib/types";
import { formatMonth } from "@/lib/utils";

export default function AnalystPage() {
  // useSearchParams() needs a Suspense boundary in Next.js 15 client components.
  return (
    <Suspense fallback={null}>
      <AnalystForm />
    </Suspense>
  );
}

function AnalystForm() {
  const { setDemos, flash, logActivity, user, salesAgents, demos } = useStore();
  // Query-param prefill — used by the "Reject AI draft" flow so the analyst
  // can rewrite the review from scratch with the demo metadata already filled in.
  const params = useSearchParams();
  const blank = {
    date: new Date().toISOString().split("T")[0],
    teacher: params.get("teacher") ?? "",
    student: params.get("student") ?? "",
    level: params.get("level") ?? "",
    subject: params.get("subject") ?? "",
    pour: {} as Record<string, string>,
    methodology: "",
    suggestions: "",
    improvement: "",
    recording: "",
    transcript: "",
    studentRaw: 7,
    analystRating: 0,
  };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const u = (k: string, v: unknown) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: "" }));
  };

  const togglePour = (cat: string) => {
    setF((p) => {
      const np = { ...p.pour };
      if (np[cat] !== undefined) delete np[cat];
      else np[cat] = "";
      return { ...p, pour: np };
    });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.teacher) e.teacher = "Required";
    if (!f.student || f.student.length < 2) e.student = "Min 2 characters";
    if (!f.level) e.level = "Required";
    if (!f.subject) e.subject = "Required";
    if (!f.analystRating) e.analystRating = "Please rate";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (submitting) return;
    if (!f.analystRating) {
      setErrors((p) => ({ ...p, analystRating: "Please rate" }));
      flash("Analyst rating is required.");
      return;
    }
    if (!validate()) { flash("Please fix errors above"); return; }
    setSubmitting(true);
    const t = TEACHERS.find((x) => x.name === f.teacher);
    const pourArr = Object.entries(f.pour).map(([cat, desc]) => ({ cat, desc }));
    const student = f.student;
    // Capture Date.now() ONCE outside the updater so React Strict Mode
    // double-invocation produces the same Demo (same id) and the store's
    // shouldFire dedup catches the second INSERT. Calling Date.now()
    // inside the updater creates two rows with ids off-by-one.
    const now = Date.now();

    // Fix 2 — round-robin auto-assign to the sales agent with the fewest
    // currently-assigned demos. Pure frontend: count from `demos` in state,
    // pick lowest, set salesAgentId + agent display name. Phase 3's Router
    // Agent will eventually replace this with smarter routing.
    let assignedAgentId: string | null = null;
    let assignedAgentName = "";
    if (salesAgents.length > 0) {
      const counts = new Map<string, number>(salesAgents.map((a) => [a.id, 0]));
      demos.forEach((d) => {
        if (d.salesAgentId && counts.has(d.salesAgentId)) {
          counts.set(d.salesAgentId, (counts.get(d.salesAgentId) ?? 0) + 1);
        }
      });
      const [lowestId] = [...counts.entries()].sort((a, b) => a[1] - b[1])[0];
      assignedAgentId = lowestId;
      assignedAgentName = salesAgents.find((a) => a.id === lowestId)?.full_name ?? "";
    }

    const newDemo = {
      id: now, date: f.date, teacher: f.teacher, tid: t ? t.uid : 0,
      student, level: f.level, subject: f.subject, pour: pourArr,
      review: f.methodology, studentRaw: f.studentRaw, analystRating: f.analystRating,
      status: "Pending" as const, suggestions: f.suggestions, improvement: f.improvement,
      agent: assignedAgentName, comments: "", verbatim: "", acctType: "", link: "",
      recording: f.recording, transcript: f.transcript || null,
      topicReview: "", resourcesReview: "", effectivenessReview: "",
      marketing: false, ts: now,
      workflowStage: "pending_sales" as const,
      salesAgentId: assignedAgentId,
      analystId: user?.id ?? null,
      // Sales-feedback defaults — populated later by the sales agent in /sales
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
    setDemos((p) => [newDemo, ...p]);
    logActivity(
      "submitted",
      user?.full_name ?? "Analyst",
      assignedAgentName
        ? `${student} demo → ${assignedAgentName}`
        : `${student} demo (unassigned)`
    );
    flash(
      assignedAgentName
        ? `Demo submitted → assigned to ${assignedAgentName}`
        : "Demo submitted (no sales agent available)"
    );
    setF(blank);
    setErrors({});
    setTimeout(() => setSubmitting(false), 1000);
  };

  const derivedMonth = f.date ? formatMonth(f.date) : "";

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
        <div className="animate-fade-up" style={{ maxWidth: 640, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Steps 1 - 5</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Analyst review.</h1>
          <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.47, marginTop: 8 }}>
            Record your demo evaluation across all dimensions.
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {/* Session Info */}
          <SectionHeader num="01" title="Session information" subtitle="Basic demo data and teacher selection.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Demo date *">
                <input type="date" className="apple-input" value={f.date} onChange={(e) => u("date", e.target.value)} />
                {derivedMonth && <div style={{ fontSize: 11, color: BLUE, marginTop: 4, fontWeight: 500 }}>Month: {derivedMonth}</div>}
              </Field>
              <Field label="Teacher *" error={errors.teacher}>
                <select className={"apple-input apple-select" + (errors.teacher ? " error" : "")} value={f.teacher} onChange={(e) => u("teacher", e.target.value)}>
                  <option value="">Select teacher...</option>
                  {TEACHERS.map((t) => (
                    <option key={t.id} value={t.name}>{t.name} (ID: {t.uid})</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Recording URL">
              <input type="url" className="apple-input" placeholder="https://zoom.us/rec/..." value={f.recording} onChange={(e) => u("recording", e.target.value)} />
            </Field>
            <Field label="Transcript (paste from Zoom/Meet — enables AI analysis)">
              <textarea
                className="apple-input apple-textarea"
                style={{ minHeight: 120, fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace" }}
                placeholder="[00:00] Teacher: Hello! ..."
                value={f.transcript}
                onChange={(e) => u("transcript", e.target.value)}
              />
            </Field>
            <Field label="Student name *" error={errors.student}>
              <input className={"apple-input" + (errors.student ? " error" : "")} placeholder="Full name" value={f.student} onChange={(e) => u("student", e.target.value)} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Level *" error={errors.level}>
                <select className={"apple-input apple-select" + (errors.level ? " error" : "")} value={f.level} onChange={(e) => u("level", e.target.value)}>
                  <option value="">Select...</option>
                  {LEVELS.map((l) => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Subject *" error={errors.subject}>
                <select className={"apple-input apple-select" + (errors.subject ? " error" : "")} value={f.subject} onChange={(e) => u("subject", e.target.value)}>
                  <option value="">Select...</option>
                  {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          </SectionHeader>

          {/* POUR */}
          <SectionHeader num="02" title="POUR issue flags" subtitle="Flag issues and describe each one.">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {POUR_CATS.map((cat) => (
                <div key={cat}>
                  <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, background: f.pour[cat] !== undefined ? "#FFF3E0" : LIGHT_GRAY, border: f.pour[cat] !== undefined ? "1px solid #E8A040" : "1px solid #e8e8ed", cursor: "pointer", fontSize: 14, fontWeight: 500, color: f.pour[cat] !== undefined ? "#8B5000" : "#1d1d1f" }}>
                    <input type="checkbox" className="apple-checkbox" checked={f.pour[cat] !== undefined} onChange={() => togglePour(cat)} />
                    {cat}
                  </label>
                  {f.pour[cat] !== undefined && (
                    <input className="apple-input" style={{ marginTop: 6, fontSize: 13 }} placeholder={"Describe the " + cat.toLowerCase() + " issue..."} value={f.pour[cat]} onChange={(e) => setF((p) => ({ ...p, pour: { ...p.pour, [cat]: e.target.value } }))} />
                  )}
                </div>
              ))}
            </div>
          </SectionHeader>

          {/* Review */}
          <SectionHeader num="03" title="Qualitative review" subtitle="Evaluate across structured dimensions.">
            <Field label="Methodology and engagement">
              <textarea className="apple-input apple-textarea" placeholder="Teaching approach, student participation..." value={f.methodology} onChange={(e) => u("methodology", e.target.value)} />
            </Field>
            <Field label="Suggestions">
              <textarea className="apple-input apple-textarea" placeholder="Recommendations..." value={f.suggestions} onChange={(e) => u("suggestions", e.target.value)} />
            </Field>
            <Field label="Point of improvement">
              <input className="apple-input" placeholder="Key focus area" value={f.improvement} onChange={(e) => u("improvement", e.target.value)} />
            </Field>
          </SectionHeader>

          {/* Ratings */}
          <SectionHeader num="04" title="Feedback and ratings" subtitle="Student feedback + your analyst rating.">
            <Field label={"Student rating: " + f.studentRaw + "/10 → " + Math.round(f.studentRaw / 2) + "/5"}>
              <input type="range" min="1" max="10" step="1" value={f.studentRaw} onChange={(e) => u("studentRaw", Number(e.target.value))} style={{ width: "100%", accentColor: BLUE }} />
            </Field>
            <Field label="Analyst rating *" error={errors.analystRating}>
              <div
                style={{
                  display: "inline-block",
                  padding: errors.analystRating ? "6px 10px" : undefined,
                  borderRadius: 10,
                  border: errors.analystRating ? "1px solid #E24B4A" : "1px solid transparent",
                  background: errors.analystRating ? "#FFEBEE" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <Stars value={f.analystRating} onChange={(v) => u("analystRating", v)} />
              </div>
            </Field>
          </SectionHeader>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button className="pill pill-outline" onClick={() => { setF(blank); setErrors({}); }} disabled={submitting}>Reset</button>
            <button
              className="pill pill-blue"
              style={{
                padding: "12px 32px",
                fontSize: 17,
                opacity: submitting || f.analystRating === 0 ? 0.5 : 1,
                cursor: submitting || f.analystRating === 0 ? "not-allowed" : "pointer",
              }}
              onClick={submit}
              disabled={submitting || f.analystRating === 0}
            >
              {submitting ? "Submitting…" : "Submit to sales queue"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
