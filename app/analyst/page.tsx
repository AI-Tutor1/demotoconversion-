"use client";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Field } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { LEVELS, SUBJECTS, GRADES, LIGHT_GRAY, MUTED } from "@/lib/types";
import { teacherFullName } from "@/lib/teacher-transforms";

export default function AnalystPage() {
  // useSearchParams() needs a Suspense boundary in Next.js 15 client components.
  return (
    <Suspense fallback={null}>
      <AnalystForm />
    </Suspense>
  );
}

function AnalystForm() {
  const router = useRouter();
  const { createDemo, flash, logActivity, user, salesAgents, demos, triggerProcessRecording, approvedTeachers, leads, createLead } = useStore();
  // Query-param prefill — used by the "Reject AI draft" flow so the analyst
  // can re-log a session with demo metadata already filled in.
  const params = useSearchParams();
  // f.teacher holds the teacher's tid as a string (unique across the roster,
  // unlike names — two teachers share "Muhammad Ebraheem", two share "Minahil
  // Sohail"). Prefill order: explicit ?tid=… first, then legacy ?teacher=…
  // resolved to the first tid that matches by name.
  const prefillTid = params.get("tid");
  const prefillName = params.get("teacher");
  const resolvedTeacher =
    prefillTid ??
    (prefillName
      ? String(
          approvedTeachers.find((t) => teacherFullName(t) === prefillName)?.tid ?? ""
        )
      : "");
  const blank = {
    date: new Date().toISOString().split("T")[0],
    teacher: resolvedTeacher,
    student: params.get("student") ?? "",
    level: params.get("level") ?? "",
    grade: params.get("grade") ?? "",
    subject: params.get("subject") ?? "",
    recording: "",
    leadId: "",
    createNewLead: false,
  };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const u = (k: string, v: unknown) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: "" }));
  };

  const leadOptions = useMemo(() => {
    const q = f.student.toLowerCase().trim();
    const matched = q.length >= 2
      ? leads.filter ((l) => (l.studentName ?? "").toLowerCase().includes(q))
      : leads.slice(0, 50);
    return [
      { value: "__new__", label: "+ Create new lead" },
      ...matched.map((l) => ({ value: String(l.id), label: `${l.leadNumber} — ${l.studentName}` })),
    ];
  }, [leads, f.student]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.teacher) e.teacher = "Required";
    if (!f.student || f.student.length < 2) e.student = "Min 2 characters";
    if (!f.leadId && !f.createNewLead) e.lead = "Select an existing lead or create a new one";
    if (!f.level) e.level = "Required";
    if (!f.grade) e.grade = "Required";
    if (!f.subject) e.subject = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (submitting) return;
    if (!validate()) { flash("Please fix errors above"); return; }
    setSubmitting(true);

    const selectedTeacher = approvedTeachers.find((x) => String(x.tid) === f.teacher);
    const t = selectedTeacher
      ? { uid: selectedTeacher.tid ?? 0, name: teacherFullName(selectedTeacher) }
      : null;
    const student = f.student;
    const now = Date.now();

    // Sales-agent creator: assign the demo to themselves (RLS only lets them
    // read/update rows where sales_agent_id = auth.uid(), so round-robin
    // handing it to a different sales agent would lock them out).
    // Otherwise, round-robin to the sales agent with the fewest demos.
    let assignedAgentId: string | null = null;
    let assignedAgentName = "";
    if (user?.role === "sales_agent") {
      assignedAgentId = user.id;
      assignedAgentName = user.full_name;
    } else if (salesAgents.length > 0) {
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

    // Resolve the lead before inserting the demo
    let resolvedLeadId: number | null = null;
    let resolvedLeadNumber: string | null = null;
    if (f.createNewLead) {
      const leadResult = await createLead(f.student);
      if (!leadResult.ok) {
        flash(`Failed to create lead: ${leadResult.error}`);
        setSubmitting(false);
        return;
      }
      resolvedLeadId = leadResult.id;
      resolvedLeadNumber = leadResult.leadNumber;
    } else if (f.leadId) {
      resolvedLeadId = Number(f.leadId);
      resolvedLeadNumber = leads.find((l) => l.id === resolvedLeadId)?.leadNumber ?? null;
    }

    const newDemo = {
      id: now, date: f.date, teacher: t?.name ?? "", tid: t?.uid ?? 0,
      student, level: f.level, grade: f.grade, subject: f.subject,
      pour: [], review: "", studentRaw: 0, analystRating: 0,
      status: "Pending" as const, suggestions: "",
      methodology: undefined, engagement: undefined, improvement: undefined,
      topicReview: "", resourcesReview: "", effectivenessReview: "",
      agent: assignedAgentName, comments: "", verbatim: "", acctType: "", link: "",
      accountabilityFinal: [],
      accountabilityFinalAt: null,
      accountabilityFinalBy: null,
      recording: f.recording, transcript: null,
      marketing: false, ts: now,
      workflowStage: "new" as const,
      salesAgentId: assignedAgentId,
      analystId:
        user && (user.role === "analyst" || user.role === "manager")
          ? user.id
          : null,
      // Sales-created demos are hidden from Dashboard/Analytics until AI auto-approves.
      isDraft: user?.role === "sales_agent",
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
      leadId: resolvedLeadId,
      leadNumber: resolvedLeadNumber,
    };

    // ─── INSERT first, get the real DB id, THEN call backend ───────────
    // Calling triggerProcessRecording(now) with a placeholder id caused a 404
    // because the Supabase INSERT hadn't completed yet. createDemo() awaits
    // the RPC and returns the server-assigned BIGSERIAL id before we proceed.
    const created = await createDemo(newDemo);
    if (!created.ok) {
      flash(`Failed to save demo: ${created.error}`);
      setSubmitting(false);
      return;
    }
    logActivity("submitted", `${student} demo`);
    router.push(`/analyst/${created.id}`);

    if (f.recording && f.recording.trim()) {
      flash("Demo saved — processing recording...");
      triggerProcessRecording(created.id).then((result) => {
        if (result.ok) {
          flash(`AI analysis complete for ${student} — check Sales for follow-up`);
        } else {
          flash(`Recording processing failed: ${result.error}. Use the 'Process Recording' button to retry.`);
        }
      });
    } else {
      flash("Demo saved. Add a recording link to enable AI analysis.");
    }

    setF(blank);
    setErrors({});
    setSubmitting(false);
  };

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
        <div className="animate-fade-up" style={{ maxWidth: 640, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">New demo</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Log a demo session.</h1>
          <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.47, marginTop: 8 }}>
            Enter the session details. AI will analyze the recording automatically.
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Demo date *">
              <input type="date" className="apple-input" value={f.date} onChange={(e) => u("date", e.target.value)} />
            </Field>
            <Field label="Teacher *" error={errors.teacher}>
              <SearchableSelect
                buttonClassName={"apple-input apple-select" + (errors.teacher ? " error" : "")}
                width="100%"
                invalid={!!errors.teacher}
                value={f.teacher}
                onChange={(v) => u("teacher", v)}
                placeholder="Select teacher..."
                clearLabel="Clear selection"
                options={approvedTeachers
                  .filter((t) => t.tid != null)
                  .map((t) => ({
                    value: String(t.tid),
                    label: `${teacherFullName(t)} (ID: ${t.tid})`,
                  }))}
              />
            </Field>
          </div>

          <Field label="Student name *" error={errors.student}>
            <input className={"apple-input" + (errors.student ? " error" : "")} placeholder="Full name" value={f.student} onChange={(e) => u("student", e.target.value)} />
          </Field>

          <Field label="Lead *" error={errors.lead}>
            <SearchableSelect
              buttonClassName={"apple-input apple-select" + (errors.lead ? " error" : "")}
              width="100%"
              invalid={!!errors.lead}
              value={f.createNewLead ? "__new__" : f.leadId}
              onChange={(v) => {
                if (v === "__new__") {
                  setF ((p) => ({ ...p, leadId: "", createNewLead: true }));
                } else {
                  setF ((p) => ({ ...p, leadId: v, createNewLead: false }));
                }
                setErrors((p) => ({ ...p, lead: "" }));
              }}
              placeholder="Search by student name or select..."
              clearLabel="Clear lead selection"
              options={leadOptions}
            />
            {f.createNewLead && (
              <p style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
                A new lead will be created for &quot;{f.student || "this student"}&quot; on submit.
              </p>
            )}
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <Field label="Level *" error={errors.level}>
              <SearchableSelect
                buttonClassName={"apple-input apple-select" + (errors.level ? " error" : "")}
                width="100%"
                invalid={!!errors.level}
                value={f.level}
                onChange={(v) => u("level", v)}
                placeholder="Select..."
                clearLabel="Clear selection"
                options={LEVELS.map((l) => ({ value: l, label: l }))}
              />
            </Field>
            <Field label="Grade *" error={errors.grade}>
              <SearchableSelect
                buttonClassName={"apple-input apple-select" + (errors.grade ? " error" : "")}
                width="100%"
                invalid={!!errors.grade}
                value={f.grade}
                onChange={(v) => u("grade", v)}
                placeholder="Select..."
                clearLabel="Clear selection"
                options={GRADES.map((g) => ({ value: g, label: g }))}
              />
            </Field>
            <Field label="Subject *" error={errors.subject}>
              <SearchableSelect
                buttonClassName={"apple-input apple-select" + (errors.subject ? " error" : "")}
                width="100%"
                invalid={!!errors.subject}
                value={f.subject}
                onChange={(v) => u("subject", v)}
                placeholder="Select..."
                clearLabel="Clear selection"
                options={SUBJECTS.map((s) => ({ value: s, label: s }))}
              />
            </Field>
          </div>

          <Field label="Recording link">
            <input type="url" className="apple-input" placeholder="https://drive.google.com/..." value={f.recording} onChange={(e) => u("recording", e.target.value)} />
            <p style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
              Google Drive link. AI will auto-transcribe and analyze when submitted.
            </p>
          </Field>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
            <button className="pill pill-outline" onClick={() => { setF(blank); setErrors({}); }} disabled={submitting}>Reset</button>
            <button
              className="pill pill-blue"
              style={{ padding: "12px 32px", fontSize: 17, opacity: submitting ? 0.5 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit demo"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
