"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { Field } from "@/components/ui";
import {
  BLUE,
  CURRICULA,
  HR_INTERVIEW_CATEGORIES,
  HR_INTERVIEW_QUESTIONS,
  LEVELS,
  LIGHT_GRAY,
  MUTED,
  NEAR_BLACK,
  POUR_CATS,
  SUBJECTS,
  type DraftData,
  type InterviewRubric,
  type RubricAnswer,
  type TeacherInterviewDraft,
  type TeacherProfile,
  type TeachingMatrixEntry,
} from "@/lib/types";
import { dbRowToInterviewDraft, teacherFullName } from "@/lib/teacher-transforms";
import {
  Q_KEYS,
  Q_META,
  SCORECARD_MAX,
  interpretationBadge,
  scoreColor,
} from "@/lib/scorecard";
import TeacherRatesEditor from "@/components/teacher-rates-editor";
import TeacherScheduleEditor from "@/components/teacher-schedule-editor";
import { RubricQuestion, ScoreScale } from "@/components/rubric";

/**
 * HrInterviewDrawer — candidate interview workspace.
 *
 * Tabs:
 *   Info       — candidate details (read-only snapshot)
 *   Interview  — recording URL + teaching matrix editor + notes +
 *                "Transcribe + Analyze" button (POSTs to recruitment.py)
 *   Scorecard  — transcript + AI draft data (v1 surface: read-only JSON tree;
 *                a proper accept/edit UI mirroring session-draft-review is a
 *                polish pass once the HR-specific rubric prompt lands)
 *   Rates      — TeacherRatesEditor (side table)
 *   Schedule   — TeacherScheduleEditor (side table)
 *   Decision   — Approved/Pending/Rejected; tutor-ID revealed on Approved;
 *                reject reason on Rejected
 */

type Tab = "info" | "interview" | "scorecard" | "rates" | "schedule" | "decision";

const TABS: { key: Tab; label: string }[] = [
  { key: "info", label: "Info" },
  { key: "interview", label: "Interview" },
  { key: "scorecard", label: "Scorecard" },
  { key: "rates", label: "Rates" },
  { key: "schedule", label: "Schedule" },
  { key: "decision", label: "Decision" },
];

interface Props {
  profile: TeacherProfile;
  onClose: () => void;
}

export default function HrInterviewDrawer({ profile, onClose }: Props) {
  const { submitInterview, finalizeTeacherDecision, processHrRecording, flash, logActivity } = useStore();
  const [tab, setTab] = useState<Tab>("info");
  const [busy, setBusy] = useState(false);

  // Interview tab state
  const [recordingLink, setRecordingLink] = useState(profile.interviewRecordingLink ?? "");
  const [matrix, setMatrix] = useState<TeachingMatrixEntry[]>(profile.teachingMatrix ?? []);
  const [notes, setNotes] = useState(profile.interviewNotes ?? "");
  const [rubric, setRubric] = useState<InterviewRubric>(() => {
    const seed: InterviewRubric = { ...(profile.interviewRubric ?? {}) };
    for (const q of HR_INTERVIEW_QUESTIONS) {
      if (!(q.key in seed)) seed[q.key] = { value: null, note: "" };
    }
    return seed;
  });
  const updateRubric = (key: string, patch: Partial<RubricAnswer>) =>
    setRubric((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { value: null, note: "" }), ...patch } }));

  // Decision tab state
  const [outcome, setOutcome] = useState<"approved" | "pending" | "rejected">("approved");
  const [tid, setTid] = useState<string>(profile.tid?.toString() ?? "");
  const [rejectReason, setRejectReason] = useState("");

  // Scorecard tab — fetched lazily
  const [draft, setDraft] = useState<TeacherInterviewDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  // Latest task_queue row for this profile — drives the status banner +
  // button disabling. Realtime subscription pushes updates.
  interface TaskRow {
    id: string;
    agent_name: string;
    status: "queued" | "running" | "completed" | "failed" | "retrying";
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
  }
  const [latestTask, setLatestTask] = useState<TaskRow | null>(null);

  const fetchDraft = useCallback(async () => {
    setDraftLoading(true);
    const { data, error } = await supabase
      .from("hr_interview_drafts")
      .select("*")
      .eq("teacher_profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      setDraft(null);
    } else {
      const first = (data ?? [])[0];
      setDraft(first ? dbRowToInterviewDraft(first) : null);
    }
    setDraftLoading(false);
  }, [profile.id]);

  useEffect(() => { fetchDraft(); }, [fetchDraft]);

  // Fetch the most recent task_queue row for this profile so we know
  // whether anything is in-flight before the user clicks anything.
  const fetchLatestTask = useCallback(async () => {
    const { data } = await supabase
      .from("task_queue")
      .select("id, agent_name, status, error_message, started_at, completed_at")
      .eq("teacher_profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1);
    setLatestTask((data?.[0] as TaskRow | undefined) ?? null);
  }, [profile.id]);

  useEffect(() => { fetchLatestTask(); }, [fetchLatestTask]);

  // Realtime — new scorecard arrives via hr_interview_drafts INSERT/UPDATE,
  // and task status transitions arrive via task_queue. One multiplexed channel.
  useEffect(() => {
    const channel = supabase
      .channel(`hr-drawer-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hr_interview_drafts", filter: `teacher_profile_id=eq.${profile.id}` },
        () => { fetchDraft(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_queue", filter: `teacher_profile_id=eq.${profile.id}` },
        () => { fetchLatestTask(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile.id, fetchDraft, fetchLatestTask]);

  const taskInFlight = latestTask?.status === "running" || latestTask?.status === "queued" || latestTask?.status === "retrying";

  const addMatrixRow = () => setMatrix((m) => [...m, { level: LEVELS[0], subject: SUBJECTS[0], curriculum: CURRICULA[0], grade: "" }]);
  const updateMatrixRow = (i: number, patch: Partial<TeachingMatrixEntry>) =>
    setMatrix((m) => m.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const deleteMatrixRow = (i: number) => setMatrix((m) => m.filter((_, j) => j !== i));

  const validateRubric = (): string | null => {
    for (const q of HR_INTERVIEW_QUESTIONS) {
      const a = rubric[q.key];
      if (a?.value !== null && a?.value !== "" && q.requireNoteWhen && q.requireNoteWhen(a.value) && !(a.note ?? "").trim()) {
        return `"${q.label}" requires a note`;
      }
    }
    return null;
  };

  const saveInterview = async () => {
    if (!recordingLink.trim()) {
      flash("Recording URL is required");
      return;
    }
    const rubricError = validateRubric();
    if (rubricError) {
      flash(rubricError);
      return;
    }
    setBusy(true);
    const res = await submitInterview(profile.id, recordingLink.trim(), matrix, notes, rubric);
    setBusy(false);
    if (!res.ok) {
      flash(`Save failed: ${res.error}`);
      return;
    }
    flash("Interview saved");
    logActivity("submitted interview", teacherFullName(profile));
  };

  const transcribeAndAnalyze = async () => {
    if (!recordingLink.trim()) {
      flash("Add a Google Drive recording URL first");
      return;
    }
    if (taskInFlight) {
      flash("Already processing — watching for results");
      setTab("scorecard");
      return;
    }
    const rubricError = validateRubric();
    if (rubricError) {
      flash(rubricError);
      return;
    }
    // Persist any pending edits first so the backend reads the current recording link.
    setBusy(true);
    const saveRes = await submitInterview(profile.id, recordingLink.trim(), matrix, notes, rubric);
    if (!saveRes.ok) {
      setBusy(false);
      flash(`Save failed: ${saveRes.error}`);
      return;
    }
    const res = await processHrRecording(profile.id);
    setBusy(false);
    if (!res.ok) {
      // 409 = something is already running. Not a failure — just watch.
      if (/already in progress|409/i.test(res.error)) {
        flash("Already processing — watching for results");
        fetchLatestTask();
        setTab("scorecard");
        return;
      }
      flash(`Transcribe failed: ${res.error}`);
      return;
    }
    flash("Transcription started — scorecard will appear when ready");
    fetchLatestTask();
    setTab("scorecard");
  };

  const finalize = async () => {
    if (outcome === "approved") {
      const parsed = Number(tid.trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        flash("Approval requires a numeric tutor ID");
        return;
      }
    }
    if (outcome === "rejected" && !rejectReason.trim()) {
      flash("Rejection reason is required");
      return;
    }
    setBusy(true);
    const res = await finalizeTeacherDecision(
      profile.id,
      outcome,
      outcome === "approved" ? Number(tid.trim()) : null,
      outcome === "rejected" ? rejectReason.trim() : null
    );
    setBusy(false);
    if (!res.ok) {
      if (res.error.toLowerCase().includes("duplicate") || res.error.includes("unique")) {
        flash("That tutor ID is already assigned to another teacher");
      } else {
        flash(`Finalisation failed: ${res.error}`);
      }
      return;
    }
    flash(`Candidate ${outcome}`);
    logActivity(`finalised as ${outcome}`, teacherFullName(profile));
    onClose();
  };

  const statusBadge = useMemo(() => {
    const map: Record<string, { bg: string; c: string }> = {
      candidate:           { bg: "#E3F2FD", c: "#0D47A1" },
      interview_scheduled: { bg: "#FFF3E0", c: "#E65100" },
      pending:             { bg: "#FFF8E1", c: "#8B6914" },
      approved:            { bg: "#E8F5E9", c: "#1B5E20" },
      rejected:            { bg: "#FFEBEE", c: "#B71C1C" },
      archived:            { bg: "#ECEFF1", c: "#37474F" },
    };
    const s = map[profile.status] ?? map.candidate;
    return (
      <span style={{ padding: "3px 10px", borderRadius: 980, fontSize: 11, fontWeight: 500, background: s.bg, color: s.c }}>
        {profile.status.replace("_", " ")}
      </span>
    );
  }, [profile.status]);

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
      <div
        className="animate-slide-in"
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0,
          width: "100%", maxWidth: 720, background: "#fff",
          boxShadow: "-8px 0 28px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{teacherFullName(profile)}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                HR# {profile.hrApplicationNumber} · {profile.phoneNumber}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {statusBadge}
              <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED }}>×</button>
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 14, borderBottom: "1px solid #f0f0f0", marginBottom: -1 }}>
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: "8px 12px",
                    border: "none",
                    background: "none",
                    borderBottom: active ? `2px solid ${BLUE}` : "2px solid transparent",
                    color: active ? BLUE : MUTED,
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {tab === "info" && (
            <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
              <InfoRow label="First name" value={profile.firstName} />
              <InfoRow label="Last name" value={profile.lastName === "—" ? "" : profile.lastName} />
              <InfoRow label="Email" value={profile.email ?? ""} />
              <InfoRow label="Phone" value={profile.phoneNumber} />
              <InfoRow label="HR application number" value={profile.hrApplicationNumber} />
              <InfoRow label="Qualification" value={profile.qualification ?? ""} />
              <InfoRow
                label="CV link"
                value={profile.cvLink ?? ""}
                href={profile.cvLink ?? undefined}
              />
              <InfoRow
                label="Subjects interested"
                value={profile.subjectsInterested.join(", ") || "—"}
              />
              <InfoRow
                label="Tutor ID"
                value={profile.tid?.toString() ?? "—"}
              />
            </div>
          )}

          {tab === "interview" && (
            <div>
              <Field label="Google Drive recording URL *">
                <input
                  className="apple-input"
                  value={recordingLink}
                  onChange={(e) => setRecordingLink(e.target.value)}
                  placeholder="https://drive.google.com/file/d/…"
                />
              </Field>

              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Teaching matrix</div>
                  <button
                    type="button"
                    onClick={addMatrixRow}
                    style={{ background: "none", border: `1px solid ${BLUE}`, color: BLUE, padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                  >
                    + Add row
                  </button>
                </div>
                {matrix.length === 0 ? (
                  <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>No rows yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {matrix.map((row, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 40px", gap: 8 }}>
                        <select className="apple-select" value={row.curriculum} onChange={(e) => updateMatrixRow(i, { curriculum: e.target.value })}>
                          {CURRICULA.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select className="apple-select" value={row.level} onChange={(e) => updateMatrixRow(i, { level: e.target.value })}>
                          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <input
                          className="apple-input"
                          value={row.grade ?? ""}
                          onChange={(e) => updateMatrixRow(i, { grade: e.target.value })}
                          placeholder="Grade (e.g. 9, AS)"
                        />
                        <select className="apple-select" value={row.subject} onChange={(e) => updateMatrixRow(i, { subject: e.target.value })}>
                          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => deleteMatrixRow(i)}
                          aria-label="Delete row"
                          style={{ background: "none", border: "none", color: "#B71C1C", fontSize: 18, cursor: "pointer" }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: NEAR_BLACK }}>
                  Interviewer rubric
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 12 }}>
                  Fill as you conduct the interview. Saved alongside the AI scorecard.
                </div>

                {HR_INTERVIEW_CATEGORIES.map((category) => (
                  <div key={category} style={{ marginTop: 16 }}>
                    <div className="section-label" style={{ marginBottom: 8 }}>
                      {category}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {HR_INTERVIEW_QUESTIONS
                        .filter((q) => q.category === category)
                        .map((q) => (
                          <RubricQuestion
                            key={q.key}
                            q={q}
                            answer={rubric[q.key] ?? { value: null, note: "" }}
                            onChange={(patch) => updateRubric(q.key, patch)}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>

              <TaskStatusBanner task={latestTask} />

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  onClick={saveInterview}
                  disabled={busy}
                  className="pill pill-outline"
                  style={{ border: "1px solid #d2d2d7", cursor: busy ? "wait" : "pointer" }}
                >
                  Save without transcribing
                </button>
                <button
                  onClick={transcribeAndAnalyze}
                  disabled={busy || taskInFlight}
                  className="pill pill-blue"
                  style={{ border: "none", background: BLUE, cursor: busy || taskInFlight ? "wait" : "pointer", opacity: busy || taskInFlight ? 0.6 : 1 }}
                >
                  {busy
                    ? "Working…"
                    : latestTask?.status === "running" && latestTask.agent_name === "hr_interview_ingest"
                      ? "Transcribing…"
                      : latestTask?.status === "running" && latestTask.agent_name === "hr_interview_analyst"
                        ? "Analyzing…"
                        : latestTask?.status === "queued"
                          ? "Queued…"
                          : "Transcribe + Analyze"}
                </button>
              </div>
            </div>
          )}

          {tab === "scorecard" && (
            <div>
              <TaskStatusBanner task={latestTask} />
              {draftLoading ? (
                <div style={{ color: MUTED }}>Loading scorecard…</div>
              ) : !draft ? (
                <div style={{ color: MUTED, fontSize: 13, padding: "24px 16px", textAlign: "center", background: "#fafafa", borderRadius: 8 }}>
                  {taskInFlight
                    ? "Backend is working on it — the scorecard will appear here when ready."
                    : "No scorecard yet. Trigger a transcription from the Interview tab."}
                </div>
              ) : (
                <ScorecardView draft={draft} />
              )}
            </div>
          )}

          {tab === "rates" && <TeacherRatesEditor profileId={profile.id} />}
          {tab === "schedule" && <TeacherScheduleEditor profileId={profile.id} />}

          {tab === "decision" && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Outcome</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {(["approved", "pending", "rejected"] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOutcome(o)}
                    className={o === outcome ? "pill pill-blue" : "pill pill-outline"}
                    style={{
                      border: o === outcome ? "none" : "1px solid #d2d2d7",
                      cursor: "pointer",
                      background: o === outcome ? BLUE : undefined,
                    }}
                  >
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </button>
                ))}
              </div>

              {outcome === "approved" && (
                <Field label="Teacher User Number (tutor ID) *">
                  <input
                    className="apple-input"
                    type="number"
                    value={tid}
                    onChange={(e) => setTid(e.target.value)}
                    placeholder="e.g. 9999"
                  />
                </Field>
              )}

              {outcome === "rejected" && (
                <Field label="Rejection reason *">
                  <textarea
                    className="apple-input apple-textarea"
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </Field>
              )}

              <div style={{ marginTop: 20, fontSize: 11, color: MUTED }}>
                Once approved, the candidate is visible to analyst + sales_agent
                and appears in the /analyst teacher dropdown. tid becomes permanent.
              </div>

              <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={onClose} className="pill pill-outline" style={{ border: "1px solid #d2d2d7", cursor: "pointer" }}>Cancel</button>
                <button
                  onClick={finalize}
                  disabled={busy}
                  className="pill pill-blue"
                  style={{ border: "none", background: BLUE, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}
                >
                  {busy ? "Finalising…" : `Finalise as ${outcome}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Drawer-native scorecard renderer. Single column (the drawer is ≤720px),
 * reuses Q_KEYS / Q_META / scoreColor / interpretationBadge from
 * [lib/scorecard.ts](lib/scorecard.ts) so the palette + rubric stay in
 * sync with the `/analyst` and `/sessions` scorecards.
 *
 * Edit mode: the top-right button toggles the whole card into editable
 * inputs (score numbers, evidence textareas, POUR list, prose). Save
 * writes `draft_data` + status='partially_edited' + reviewed_at back to
 * hr_interview_drafts; the realtime subscription in the parent will
 * re-fetch and re-seed the view.
 */
function cloneDraftData(d: DraftData): DraftData {
  return {
    q1_teaching_methodology:    { ...d.q1_teaching_methodology },
    q2_curriculum_alignment:    { ...d.q2_curriculum_alignment },
    q3_student_interactivity:   { ...d.q3_student_interactivity },
    q4_differentiated_teaching: { ...d.q4_differentiated_teaching },
    q5_psychological_safety:    { ...d.q5_psychological_safety },
    q6_rapport_session_opening: { ...d.q6_rapport_session_opening },
    q7_technical_quality:       { ...d.q7_technical_quality },
    q8_formative_assessment:    { ...d.q8_formative_assessment },
    pour_issues: (d.pour_issues ?? []).map((p) => ({ ...p })),
    overall_summary:         d.overall_summary ?? "",
    improvement_suggestions: d.improvement_suggestions ?? "",
    improvement_focus:       d.improvement_focus ?? "",
    total_score:             d.total_score,
    score_interpretation:    d.score_interpretation ?? "",
  };
}

function ScorecardView({ draft }: { draft: TeacherInterviewDraft }) {
  const { flash, logActivity } = useStore();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<DraftData>(() => cloneDraftData(draft.draftData as DraftData));

  // Re-seed when the backing draft changes (realtime update, draft swap).
  useEffect(() => {
    setValues(cloneDraftData(draft.draftData as DraftData));
    setEditing(false);
  }, [draft.id, draft.draftData]);

  const totalScore = useMemo(
    () => Q_KEYS.reduce((sum, k) => sum + (values[k]?.score || 0), 0),
    [values]
  );
  const badge = interpretationBadge(totalScore);

  const setScore = (k: (typeof Q_KEYS)[number], score: number) =>
    setValues((prev) => ({ ...prev, [k]: { ...prev[k], score } }));
  const setEvidence = (k: (typeof Q_KEYS)[number], evidence: string) =>
    setValues((prev) => ({ ...prev, [k]: { ...prev[k], evidence } }));

  const cancel = () => {
    setValues(cloneDraftData(draft.draftData as DraftData));
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    const finalBadge = interpretationBadge(totalScore);
    const nextDraftData: DraftData = {
      ...values,
      total_score: totalScore,
      score_interpretation: finalBadge.label,
    };
    const { error } = await supabase
      .from("hr_interview_drafts")
      .update({
        draft_data: nextDraftData,
        status: "partially_edited",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", draft.id);
    setSaving(false);
    if (error) {
      flash(`Save failed: ${error.message}`);
      return;
    }
    flash("Scorecard updated");
    logActivity("edited scorecard", "hr");
    setEditing(false);
  };

  return (
    <div>
      {/* Total + interpretation */}
      <div style={{
        background: "#fff",
        border: "1px solid #e8e8ed",
        borderRadius: 14,
        padding: 18,
        marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 34, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1 }}>
              {totalScore}
              <span style={{ fontSize: 16, color: MUTED, fontWeight: 400, marginLeft: 2 }}>/{SCORECARD_MAX}</span>
            </span>
            <span style={{
              padding: "3px 12px",
              borderRadius: 980,
              background: badge.bg,
              color: badge.fg,
              fontSize: 12,
              fontWeight: 600,
            }}>
              {badge.label}
            </span>
          </div>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="pill pill-outline"
              style={{ padding: "5px 14px", fontSize: 12, border: `1px solid ${BLUE}` }}
            >
              ✐ Edit
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={cancel}
                disabled={saving}
                className="pill pill-outline"
                style={{ padding: "5px 14px", fontSize: 12, border: "1px solid #d2d2d7", color: NEAR_BLACK }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="pill pill-blue"
                style={{ padding: "5px 14px", fontSize: 12, border: "none", background: BLUE, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
        {!editing && values.score_interpretation && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: NEAR_BLACK }}>
            {values.score_interpretation}
          </p>
        )}
        {editing && (
          <p style={{ margin: 0, fontSize: 11, color: MUTED, fontStyle: "italic" }}>
            Total auto-recomputes from the question scores. Interpretation updates on save.
          </p>
        )}
      </div>

      {/* Q1–Q8 cards */}
      <div className="section-label" style={{ marginBottom: 8 }}>Question scores</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {Q_KEYS.map((k) => {
          const meta = Q_META[k];
          const se = values[k];
          if (!se) return null;
          const color = scoreColor(se.score, meta.max);
          return (
            <div
              key={k}
              style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr",
                gap: 12,
                padding: 12,
                background: LIGHT_GRAY,
                border: "1px solid #e8e8ed",
                borderLeft: `4px solid ${color}`,
                borderRadius: 10,
              }}
            >
              {editing ? (
                <input
                  type="number"
                  min={meta.min}
                  max={meta.max}
                  className="apple-input"
                  value={se.score}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const clamped = Number.isFinite(raw) ? Math.max(meta.min, Math.min(meta.max, raw)) : meta.min;
                    setScore(k, clamped);
                  }}
                  style={{ width: 48, height: 48, padding: 0, textAlign: "center", fontSize: 16, fontWeight: 700 }}
                />
              ) : (
                <div style={{
                  width: 48, height: 48, borderRadius: 10,
                  background: color, color: "#fff",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  fontWeight: 700, flexShrink: 0,
                }}>
                  <span style={{ fontSize: 17, lineHeight: 1 }}>{se.score}</span>
                  <span style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>/{meta.max}</span>
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: NEAR_BLACK }}>{meta.label}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{meta.scaleLabel}</div>
                {editing ? (
                  <textarea
                    className="apple-input apple-textarea"
                    rows={2}
                    value={se.evidence ?? ""}
                    onChange={(e) => setEvidence(k, e.target.value)}
                    style={{ fontSize: 13, marginTop: 6, width: "100%" }}
                    placeholder="Evidence"
                  />
                ) : (
                  <div style={{ fontSize: 13, color: NEAR_BLACK, marginTop: 6, lineHeight: 1.45 }}>
                    {se.evidence || "—"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* POUR issues */}
      <div className="section-label" style={{ marginBottom: 8 }}>POUR issues</div>
      {editing ? (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {values.pour_issues.map((issue, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 30px", gap: 8, alignItems: "center" }}>
              <select
                className="apple-input apple-select"
                value={issue.category}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    pour_issues: prev.pour_issues.map((p, j) => (j === i ? { ...p, category: e.target.value } : p)),
                  }))
                }
              >
                {POUR_CATS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                className="apple-input"
                style={{ fontSize: 13 }}
                placeholder="Describe the issue"
                value={issue.description}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    pour_issues: prev.pour_issues.map((p, j) => (j === i ? { ...p, description: e.target.value } : p)),
                  }))
                }
              />
              <button
                type="button"
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    pour_issues: prev.pour_issues.filter((_, j) => j !== i),
                  }))
                }
                aria-label="Remove issue"
                style={{ fontSize: 18, color: MUTED, background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
              >×</button>
            </div>
          ))}
          <button
            type="button"
            className="pill pill-outline"
            style={{ alignSelf: "flex-start", fontSize: 12, padding: "5px 14px" }}
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
      ) : values.pour_issues.length === 0 ? (
        <p style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>None observed.</p>
      ) : (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          {values.pour_issues.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span className="pour-tag">{p.category}</span>
              {p.description && (
                <span style={{ fontSize: 13, color: NEAR_BLACK, lineHeight: 1.4 }}>{p.description}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Prose sections */}
      <ProseField
        label="Overall summary"
        value={values.overall_summary}
        editing={editing}
        onChange={(v) => setValues((prev) => ({ ...prev, overall_summary: v }))}
      />
      <ProseField
        label="Improvement suggestions"
        value={values.improvement_suggestions}
        editing={editing}
        onChange={(v) => setValues((prev) => ({ ...prev, improvement_suggestions: v }))}
      />
      <ProseField
        label="Improvement focus"
        value={values.improvement_focus}
        editing={editing}
        highlight
        onChange={(v) => setValues((prev) => ({ ...prev, improvement_focus: v }))}
      />

      {/* Transcript collapsed at bottom */}
      {draft.transcript && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: NEAR_BLACK }}>
            View transcript
          </summary>
          <pre style={{
            marginTop: 10, padding: 12,
            background: "#fafafa", border: "1px solid #e8e8ed", borderRadius: 10,
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 11, lineHeight: 1.55, color: NEAR_BLACK,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            maxHeight: 320, overflowY: "auto",
            margin: 0,
          }}>{draft.transcript}</pre>
        </details>
      )}

      {editing && (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="pill pill-outline"
            style={{ padding: "6px 16px", fontSize: 13, border: "1px solid #d2d2d7", color: NEAR_BLACK }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="pill pill-blue"
            style={{ padding: "6px 16px", fontSize: 13, border: "none", background: BLUE, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : "Save scorecard"}
          </button>
        </div>
      )}

      {!editing && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 12, padding: "8px 12px", background: "#fafafa", borderRadius: 8 }}>
          v1 uses the demo-scorecard rubric as an HR bootstrap. A dedicated HR prompt (communication, subject depth, red flags, hire recommendation) lands in a follow-up — the rendered shape stays the same.
        </div>
      )}
    </div>
  );
}

function ProseField({
  label, value, editing, highlight, onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  highlight?: boolean;
  onChange: (v: string) => void;
}) {
  if (!editing && !value) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="section-label" style={{ marginBottom: 4 }}>{label}</div>
      {editing ? (
        <textarea
          className="apple-input apple-textarea"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 13, width: "100%" }}
        />
      ) : (
        <p style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.55,
          color: highlight ? BLUE : NEAR_BLACK,
          fontWeight: highlight ? 500 : 400,
        }}>
          {value}
        </p>
      )}
    </div>
  );
}

/**
 * Live status banner driven by the latest task_queue row for this profile.
 * Hidden when there's nothing interesting to say (idle + no recent failure).
 */
interface TaskStatusBannerProps {
  task: {
    agent_name: string;
    status: "queued" | "running" | "completed" | "failed" | "retrying";
    error_message: string | null;
  } | null;
}

function TaskStatusBanner({ task }: TaskStatusBannerProps) {
  if (!task) return null;

  const isIngest = task.agent_name === "hr_interview_ingest";
  const stage = isIngest ? "recording" : "scorecard";

  if (task.status === "queued") {
    return <Banner tone="info" text={`Queued — backend will pick up the ${stage} shortly.`} />;
  }
  if (task.status === "running") {
    return (
      <Banner
        tone="info"
        text={
          isIngest
            ? "Processing recording · downloading + transcribing via Whisper (this can take 30s–5min)"
            : "Analyzing transcript · running AI scorecard"
        }
        pulse
      />
    );
  }
  if (task.status === "retrying") {
    return <Banner tone="warn" text={`Retrying ${stage} after a transient failure…`} pulse />;
  }
  if (task.status === "failed") {
    return (
      <Banner
        tone="error"
        text={`${isIngest ? "Recording processing" : "Scorecard analysis"} failed · ${task.error_message ?? "Unknown error"}`}
      />
    );
  }
  return null; // completed — fall through to the actual content
}

function Banner({ tone, text, pulse }: { tone: "info" | "warn" | "error"; text: string; pulse?: boolean }) {
  const palette: Record<string, { bg: string; c: string; b: string }> = {
    info:  { bg: "#E3F2FD", c: "#0D47A1", b: "#90CAF9" },
    warn:  { bg: "#FFF3E0", c: "#8B4513", b: "#FFB74D" },
    error: { bg: "#FFEBEE", c: "#B71C1C", b: "#EF9A9A" },
  };
  const p = palette[tone];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", marginBottom: 14,
      background: p.bg, color: p.c, borderRadius: 10,
      border: `1px solid ${p.b}`,
      fontSize: 13, lineHeight: 1.45,
    }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: "50%",
          background: p.c, flexShrink: 0,
          animation: pulse ? "pulse 1.2s ease-in-out infinite" : undefined,
        }}
      />
      <span>{text}</span>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }`}</style>
    </div>
  );
}

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
      <div style={{ color: MUTED, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 13 }}>
        {href
          ? <a href={href} target="_blank" rel="noreferrer" style={{ color: BLUE }}>{value || "—"}</a>
          : (value || "—")}
      </div>
    </div>
  );
}
