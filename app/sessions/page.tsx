"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { LIGHT_GRAY, MUTED, BLUE } from "@/lib/types";
import type { Session, SessionProcessingStatus } from "@/lib/types";
import { dbRowToSession } from "@/lib/review-transforms";
import { mapSessionRow } from "@/lib/csv-parser";
import CSVUpload from "@/components/csv-upload";
import SessionStatusBadge from "@/components/session-status-badge";
import { EmptyState } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";

const PAGE_SIZE = 25;
const MAX_CONCURRENT = 5;

// ─── Static filter option sets ────────────────────────────────────────

const PROCESSING_STATUS_OPTS: { value: string; label: string }[] = [
  { value: "pending",    label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "scored",     label: "Scored" },
  { value: "approved",   label: "Approved" },
  { value: "failed",     label: "Failed" },
];

const YESNO: { value: string; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no",  label: "No" },
];

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 4,
  display: "block",
};
const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column" };

function uniqSort(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) =>
    a.localeCompare(b),
  );
}
function toOpts(arr: string[]) {
  return arr.map((v) => ({ value: v, label: v }));
}

export default function SessionsPage() {
  const { flash, user, confirmDeleteSession } = useStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [page, setPage] = useState(0);

  // Primary-filter state
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [fProcStatus, setFProcStatus] = useState<"" | SessionProcessingStatus>("");
  const [fClassStatus, setFClassStatus] = useState("");
  const [fTeacher, setFTeacher] = useState("");
  const [fStudent, setFStudent] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fBoard, setFBoard] = useState("");
  const [fCurriculum, setFCurriculum] = useState("");
  const [fEnrollId, setFEnrollId] = useState("");
  const [fAttended, setFAttended] = useState("");
  const [fRecording, setFRecording] = useState("");
  const [fTranscript, setFTranscript] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .order("session_date", { ascending: false });
    if (error) {
      flash("Failed to load sessions");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSessions((data ?? []).map((r: any) => dbRowToSession(r)));
    setLoading(false);
  }, [flash]);

  useEffect(() => {
    fetchSessions();

    // Realtime subscription for processing status updates
    const channel = supabase
      .channel("sessions-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions" },
        () => { fetchSessions(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSessions]);

  async function triggerProcessing(sessionIds: number[]): Promise<void> {
    if (sessionIds.length === 0) return;
    const backendUrl = process.env.NEXT_PUBLIC_AI_BACKEND_URL ?? "http://localhost:8000";
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const token = authSession?.access_token;
    if (!token) {
      flash("Not authenticated — cannot trigger processing");
      return;
    }

    // Process in waves of MAX_CONCURRENT to bound in-flight ingest jobs.
    let ok = 0;
    let alreadyRunning = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < sessionIds.length; i += MAX_CONCURRENT) {
      const wave = sessionIds.slice(i, i + MAX_CONCURRENT);
      const results = await Promise.allSettled(
        wave.map(async (sid) => {
          const res = await fetch(
            `${backendUrl}/api/v1/sessions/${sid}/process-recording`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } }
          );
          return { sid, res };
        })
      );
      for (const r of results) {
        if (r.status === "rejected") {
          failed++;
          errors.push(String(r.reason).slice(0, 80));
          continue;
        }
        const { res } = r.value;
        if (res.ok) {
          ok++;
        } else if (res.status === 409) {
          alreadyRunning++;
        } else {
          failed++;
          const body = await res.text().catch(() => "");
          errors.push(`${res.status}: ${body.slice(0, 80)}`);
        }
      }
    }

    const parts: string[] = [];
    if (ok > 0) parts.push(`${ok} processed`);
    if (alreadyRunning > 0) parts.push(`${alreadyRunning} already running`);
    if (failed > 0) parts.push(`${failed} failed`);
    const summary = parts.length > 0 ? parts.join(", ") : "no-op";
    flash(`Processing: ${summary}${failed > 0 && errors[0] ? ` — ${errors[0]}` : ""}`);
  }

  async function handleProcessPending() {
    const pending = sessions
      .filter((s) => s.processingStatus === "pending" && s.recordingLink)
      .map((s) => s.id);
    if (pending.length === 0) {
      flash("No pending sessions with recordings");
      return;
    }
    setProcessing(true);
    try {
      await triggerProcessing(pending);
      await fetchSessions();
    } finally {
      setProcessing(false);
    }
  }

  // Fire the backend scheduler's auto-retry tick on demand. Backend picks up
  // every failed session in the last 24hr that is (a) under the retry cap,
  // (b) past its backoff window, (c) not permanent-classified. See
  // backend/app/scheduler.py for the classifier.
  async function handleRetryAllFailed() {
    const backendUrl = process.env.NEXT_PUBLIC_AI_BACKEND_URL ?? "http://localhost:8000";
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const token = authSession?.access_token;
    if (!token) {
      flash("Not authenticated");
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(
        `${backendUrl}/api/v1/sessions/auto-retry-failed`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        flash(`Retry-all failed: HTTP ${res.status}`);
        return;
      }
      const body = await res.json() as {
        considered: number; retried: number; skipped: number;
        disabled: number; already_running: number;
      };
      if (body.disabled) {
        flash("Auto-retry is disabled via env var");
      } else if (body.already_running) {
        flash("Auto-retry already in progress — try again in a moment");
      } else {
        flash(`Auto-retry: ${body.retried} retried, ${body.skipped} skipped (${body.considered} considered)`);
      }
      await fetchSessions();
    } catch (e) {
      flash(`Retry-all failed: ${String(e).slice(0, 80)}`);
    } finally {
      setProcessing(false);
    }
  }

  async function handleCSVParsed(rows: Record<string, string>[]) {
    if (rows.length === 0) {
      flash("CSV is empty or invalid");
      return;
    }
    setUploading(true);
    const mapped = rows.map(mapSessionRow);
    const missing = mapped.filter((r) => !r.session_id || !r.enrollment_id);
    if (missing.length > 0) {
      flash(`${missing.length} rows missing Session ID or Enrollment ID — skipped`);
    }
    const valid = mapped.filter((r) => r.session_id && r.enrollment_id);
    if (valid.length === 0) {
      flash("No valid session rows found");
      setUploading(false);
      return;
    }

    // Pre-upload probe: every session's enrollment_id must exist in the
    // enrollments table. Otherwise the DB trigger will abort the batch
    // transaction mid-INSERT. Check first and bail out with a clear
    // message so the uploader knows to upload the enrollment CSV first.
    const enrollmentIds = Array.from(new Set(valid.map((r) => r.enrollment_id)));
    const existingRows: { enrollment_id: string }[] = [];
    for (let i = 0; i < enrollmentIds.length; i += 500) {
      const chunk = enrollmentIds.slice(i, i + 500);
      const { data: enrData, error: enrErr } = await supabase
        .from("enrollments")
        .select("enrollment_id")
        .in("enrollment_id", chunk);
      if (enrErr) {
        flash(`Couldn't verify enrollments: ${enrErr.message}`);
        setUploading(false);
        return;
      }
      existingRows.push(...(enrData ?? []));
    }
    const existingSet = new Set(existingRows.map((r) => r.enrollment_id));
    const orphanEnrollmentIds = enrollmentIds.filter((id) => !existingSet.has(id));
    if (orphanEnrollmentIds.length > 0) {
      const preview = orphanEnrollmentIds.slice(0, 3).join(", ");
      const suffix = orphanEnrollmentIds.length > 3
        ? ` (+${orphanEnrollmentIds.length - 3} more)`
        : "";
      flash(
        `${orphanEnrollmentIds.length} enrollment${orphanEnrollmentIds.length !== 1 ? "s" : ""} missing: ${preview}${suffix}. Upload enrollments CSV first — no sessions were inserted.`
      );
      setUploading(false);
      return;
    }

    // Batch in chunks of 500
    const allTriggerIds: number[] = [];
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500);
      const { data, error } = await supabase.rpc("upsert_sessions", {
        payload: chunk,
      });
      if (error) {
        if (error.message.includes("violates foreign key")) {
          flash("Some sessions reference enrollments not yet uploaded. Upload enrollments first.");
        } else {
          flash(`Upload error: ${error.message}`);
        }
        setUploading(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = (data as any)?.[0] ?? data;
      if (row?.auto_trigger_ids) {
        allTriggerIds.push(...row.auto_trigger_ids);
      }
    }

    // Post-upload belt-and-braces: verify every inserted row has teacher
    // linkage. The DB trigger guarantees this, but if the trigger is ever
    // dropped (or new code path sneaks in), this catches the drift early.
    const parsedSessionIds = valid.map((r) => r.session_id);
    const { data: verifyRows } = await supabase
      .from("sessions")
      .select("session_id, teacher_user_id, teacher_user_name")
      .in("session_id", parsedSessionIds);
    const unlinkedCount = (verifyRows ?? []).filter(
      (r: { teacher_user_id: string | null; teacher_user_name: string | null }) =>
        !r.teacher_user_id || !r.teacher_user_name
    ).length;

    if (unlinkedCount > 0) {
      flash(
        `${valid.length} session${valid.length !== 1 ? "s" : ""} upserted · ⚠ ${unlinkedCount} unlinked — check /admin/data-quality`
      );
    } else {
      flash(`${valid.length} session${valid.length !== 1 ? "s" : ""} upserted · all linked to teachers`);
    }
    setUploading(false);
    setPage(0);
    await fetchSessions();

    // Auto-trigger processing for sessions with recording links
    if (allTriggerIds.length > 0) {
      triggerProcessing(allTriggerIds);
    }
  }

  // ── Derived option lists — unique sorted values from live data ────────
  const teachers = useMemo(() => {
    const names = new Set<string>();
    sessions.forEach((s) => {
      if (s.teacherUserName) names.add(s.teacherUserName);
      if (s.tutorName) names.add(s.tutorName);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const students = useMemo(() => {
    const names = new Set<string>();
    sessions.forEach((s) => {
      if (s.studentUserName) names.add(s.studentUserName);
      if (s.expectedStudent1) names.add(s.expectedStudent1);
      if (s.expectedStudent2) names.add(s.expectedStudent2);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const subjects     = useMemo(() => uniqSort(sessions.map((s) => s.subject)),    [sessions]);
  const grades       = useMemo(() => uniqSort(sessions.map((s) => s.grade)),      [sessions]);
  const boards       = useMemo(() => uniqSort(sessions.map((s) => s.board)),      [sessions]);
  const curricula    = useMemo(() => uniqSort(sessions.map((s) => s.curriculum)), [sessions]);
  const classStatuses = useMemo(() => uniqSort(sessions.map((s) => s.classStatus)), [sessions]);

  const filtered = useMemo(() => {
    const q    = search.toLowerCase().trim();
    const eid  = fEnrollId.toLowerCase().trim();
    const from = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const to   = dateTo   ? new Date(dateTo   + "T23:59:59").getTime() : null;

    return sessions.filter((s) => {
      if (fProcStatus  && s.processingStatus !== fProcStatus)  return false;
      if (fClassStatus && s.classStatus      !== fClassStatus) return false;
      if (fSubject     && s.subject          !== fSubject)     return false;
      if (fGrade       && s.grade            !== fGrade)       return false;
      if (fBoard       && s.board            !== fBoard)       return false;
      if (fCurriculum  && s.curriculum       !== fCurriculum)  return false;

      if (fTeacher) {
        if (s.teacherUserName !== fTeacher && s.tutorName !== fTeacher) return false;
      }

      if (fStudent) {
        if (
          s.studentUserName !== fStudent &&
          s.expectedStudent1 !== fStudent &&
          s.expectedStudent2 !== fStudent
        ) return false;
      }

      if (eid && !(s.enrollmentId ?? "").toLowerCase().includes(eid)) return false;

      if (fAttended === "yes" && !(s.attendedStudent1 === true || s.attendedStudent2 === true)) return false;
      if (fAttended === "no"  && !(s.attendedStudent1 === false && (s.attendedStudent2 === false || s.attendedStudent2 === null))) return false;

      if (fRecording === "yes" && !s.recordingLink) return false;
      if (fRecording === "no"  &&  s.recordingLink) return false;

      if (fTranscript === "yes" && !s.transcript) return false;
      if (fTranscript === "no"  &&  s.transcript) return false;

      if (from !== null || to !== null) {
        if (!s.sessionDate) return false;
        const t = new Date(s.sessionDate + "T00:00:00").getTime();
        if (from !== null && t < from) return false;
        if (to   !== null && t > to)   return false;
      }

      if (q) {
        const hay = [
          s.tutorName, s.teacherUserName,
          s.expectedStudent1, s.expectedStudent2, s.studentUserName,
          s.subject, s.sessionId, s.enrollmentId, s.enrollmentName,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    sessions, search,
    fProcStatus, fClassStatus, fTeacher, fStudent,
    fSubject, fGrade, fBoard, fCurriculum, fEnrollId,
    fAttended, fRecording, fTranscript, dateFrom, dateTo,
  ]);

  const pendingWithRecording = useMemo(
    () =>
      sessions.filter((s) => s.processingStatus === "pending" && s.recordingLink)
        .length,
    [sessions]
  );

  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const failedCount = useMemo(
    () => sessions.filter((s) => s.processingStatus === "failed").length,
    [sessions]
  );
  const canRetryAll = user?.role === "analyst" || user?.role === "manager";

  const hasFilters =
    !!search || !!fProcStatus || !!fClassStatus ||
    !!fTeacher || !!fStudent || !!fSubject || !!fGrade || !!fBoard || !!fCurriculum ||
    !!fEnrollId || !!fAttended || !!fRecording || !!fTranscript ||
    !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setSearch(""); setFProcStatus(""); setFClassStatus("");
    setFTeacher(""); setFStudent(""); setFSubject("");
    setFGrade(""); setFBoard(""); setFCurriculum("");
    setFEnrollId(""); setFAttended(""); setFRecording(""); setFTranscript("");
    setDateFrom(""); setDateTo("");
    setPage(0);
  };

  // Reset pagination whenever a filter changes — prevents empty pages after narrow filters.
  useEffect(() => { setPage(0); }, [
    search, fProcStatus, fClassStatus, fTeacher, fStudent,
    fSubject, fGrade, fBoard, fCurriculum, fEnrollId,
    fAttended, fRecording, fTranscript, dateFrom, dateTo,
  ]);

  const SS_BTN = "apple-input";

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Product Review</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Sessions.</h1>
          <p style={{ color: MUTED, fontSize: 15, marginTop: 8 }}>
            Upload daily session CSVs. Sessions with recording links are auto-analyzed.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <CSVUpload
              label={uploading ? "Uploading..." : "Upload Daily CSV"}
              onParsed={handleCSVParsed}
              disabled={uploading || processing}
            />
            {pendingWithRecording > 0 && (
              <button
                type="button"
                onClick={handleProcessPending}
                disabled={uploading || processing}
                style={{
                  background: BLUE,
                  color: "#fff",
                  border: "none",
                  padding: "8px 20px",
                  borderRadius: 980,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: uploading || processing ? "not-allowed" : "pointer",
                  opacity: uploading || processing ? 0.5 : 1,
                }}
              >
                {processing
                  ? `Processing ${pendingWithRecording}...`
                  : `Process ${pendingWithRecording} pending`}
              </button>
            )}
            {canRetryAll && failedCount > 0 && (
              <button
                type="button"
                onClick={handleRetryAllFailed}
                disabled={uploading || processing}
                title="Fires one tick of the backend auto-retry. Permanent failures are skipped; rate-limited ones wait for their backoff window."
                style={{
                  background: "#fff",
                  color: BLUE,
                  border: `1px solid ${BLUE}`,
                  padding: "8px 20px",
                  borderRadius: 980,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: uploading || processing ? "not-allowed" : "pointer",
                  opacity: uploading || processing ? 0.5 : 1,
                }}
              >
                Retry {failedCount} failed
              </button>
            )}
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* ── toolbar ─────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: showFilters ? 12 : 24, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="sessions-filter-panel"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px",
                background: showFilters ? BLUE : "transparent",
                color: showFilters ? "#fff" : BLUE,
                border: `1px solid ${BLUE}`,
                borderRadius: 10, fontSize: 14, fontWeight: 500,
                cursor: "pointer", transition: "background 0.15s, color 0.15s", flexShrink: 0,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
                <circle cx="9"  cy="6"  r="2.5" fill="currentColor" stroke="none" />
                <circle cx="15" cy="12" r="2.5" fill="currentColor" stroke="none" />
                <circle cx="9"  cy="18" r="2.5" fill="currentColor" stroke="none" />
              </svg>
              Filters
              {hasFilters && (
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 16, height: 16, borderRadius: "50%",
                  background: showFilters ? "rgba(255,255,255,0.35)" : BLUE,
                  color: "#fff", fontSize: 10, fontWeight: 700,
                }}>•</span>
              )}
            </button>

            <input
              className="apple-input"
              placeholder="Search tutor, student, subject, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 320, fontSize: 14 }}
            />

            <span style={{ color: MUTED, fontSize: 13, marginLeft: "auto" }}>
              {filtered.length} session{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── collapsible filter panel ───────────────────────────────── */}
          {showFilters && (
            <div
              id="sessions-filter-panel"
              className="animate-fade-up"
              style={{
                marginBottom: 24, padding: 16, background: LIGHT_GRAY, borderRadius: 14,
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 12, alignItems: "end",
              }}
            >
              <div style={FIELD}>
                <label style={LABEL}>Processing status</label>
                <SearchableSelect
                  options={PROCESSING_STATUS_OPTS}
                  value={fProcStatus}
                  onChange={(v) => setFProcStatus(v as "" | SessionProcessingStatus)}
                  placeholder="All statuses"
                  clearLabel="All statuses"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Class status</label>
                <SearchableSelect
                  options={toOpts(classStatuses)}
                  value={fClassStatus}
                  onChange={setFClassStatus}
                  placeholder="All class statuses"
                  clearLabel="All class statuses"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Teacher</label>
                <SearchableSelect
                  options={toOpts(teachers)}
                  value={fTeacher}
                  onChange={setFTeacher}
                  placeholder="All teachers"
                  clearLabel="All teachers"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Student</label>
                <SearchableSelect
                  options={toOpts(students)}
                  value={fStudent}
                  onChange={setFStudent}
                  placeholder="All students"
                  clearLabel="All students"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Subject</label>
                <SearchableSelect
                  options={toOpts(subjects)}
                  value={fSubject}
                  onChange={setFSubject}
                  placeholder="All subjects"
                  clearLabel="All subjects"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Grade</label>
                <SearchableSelect
                  options={toOpts(grades)}
                  value={fGrade}
                  onChange={setFGrade}
                  placeholder="All grades"
                  clearLabel="All grades"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Board</label>
                <SearchableSelect
                  options={toOpts(boards)}
                  value={fBoard}
                  onChange={setFBoard}
                  placeholder="All boards"
                  clearLabel="All boards"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Curriculum</label>
                <SearchableSelect
                  options={toOpts(curricula)}
                  value={fCurriculum}
                  onChange={setFCurriculum}
                  placeholder="All curricula"
                  clearLabel="All curricula"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Enrollment ID</label>
                <input
                  className="apple-input"
                  placeholder="Search enrollment_id"
                  value={fEnrollId}
                  onChange={(e) => setFEnrollId(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Attended</label>
                <SearchableSelect
                  options={YESNO}
                  value={fAttended}
                  onChange={setFAttended}
                  placeholder="Any"
                  clearLabel="Any"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Has recording</label>
                <SearchableSelect
                  options={YESNO}
                  value={fRecording}
                  onChange={setFRecording}
                  placeholder="Any"
                  clearLabel="Any"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Has transcript</label>
                <SearchableSelect
                  options={YESNO}
                  value={fTranscript}
                  onChange={setFTranscript}
                  placeholder="Any"
                  clearLabel="Any"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Date From</label>
                <input
                  type="date"
                  className="apple-input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Date To</label>
                <input
                  type="date"
                  className="apple-input"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>

              {hasFilters && (
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button
                    type="button"
                    onClick={clearFilters}
                    style={{
                      background: "transparent", color: BLUE, border: `1px solid ${BLUE}`,
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                      cursor: "pointer", whiteSpace: "nowrap", width: "100%",
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <p style={{ color: MUTED, textAlign: "center", padding: 40 }}>Loading...</p>
          ) : filtered.length === 0 ? (
            <EmptyState text="No sessions found. Upload a daily CSV to get started." />
          ) : (
            <>
              <div className="review-table-wrap">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>Session ID</th>
                      <th>Tutor</th>
                      <th>Student</th>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Recording</th>
                      {user?.role === "manager" && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s.id} className="clickable">
                        <td>
                          <Link
                            href={`/sessions/${s.id}`}
                            style={{ color: BLUE, fontWeight: 500, fontSize: 13, textDecoration: "none" }}
                          >
                            {s.sessionId}
                          </Link>
                        </td>
                        <td>{s.tutorName}</td>
                        <td>{s.expectedStudent1}</td>
                        <td>{s.subject}</td>
                        <td style={{ fontSize: 13, color: MUTED }}>
                          {s.sessionDate ?? "—"}
                        </td>
                        <td>
                          <SessionStatusBadge status={s.processingStatus} />
                        </td>
                        <td>
                          {s.recordingLink ? (
                            <span style={{ fontSize: 12, color: "#30D158" }}>●</span>
                          ) : (
                            <span style={{ fontSize: 12, color: MUTED }}>—</span>
                          )}
                        </td>
                        {user?.role === "manager" && (
                          <td>
                            <button
                              type="button"
                              onClick={() =>
                                confirmDeleteSession(s.id, s.sessionId, {
                                  onAfterDelete: () =>
                                    setSessions((prev) => prev.filter((x) => x.id !== s.id)),
                                })
                              }
                              className="pill pill-outline"
                              style={{ fontSize: 11, padding: "3px 10px", color: "#B42318", borderColor: "#FDA29B" }}
                              title="Delete session"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
                  <button
                    className="pill pill-outline"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    style={{
                      padding: "6px 16px", fontSize: 13,
                      border: `1px solid ${page === 0 ? "#e5e5e5" : BLUE}`,
                      color: page === 0 ? MUTED : BLUE,
                      background: "transparent", borderRadius: 980,
                      cursor: page === 0 ? "default" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 13, color: MUTED }}>{page + 1} / {totalPages}</span>
                  <button
                    className="pill pill-outline"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    style={{
                      padding: "6px 16px", fontSize: 13,
                      border: `1px solid ${page >= totalPages - 1 ? "#e5e5e5" : BLUE}`,
                      color: page >= totalPages - 1 ? MUTED : BLUE,
                      background: "transparent", borderRadius: 980,
                      cursor: page >= totalPages - 1 ? "default" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
