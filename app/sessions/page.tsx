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

const PAGE_SIZE = 25;
const MAX_CONCURRENT = 5;

export default function SessionsPage() {
  const { flash, user } = useStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState<"all" | SessionProcessingStatus>("all");
  const [page, setPage] = useState(0);

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

    flash(`${valid.length} session${valid.length !== 1 ? "s" : ""} upserted`);
    setUploading(false);
    setPage(0);
    await fetchSessions();

    // Auto-trigger processing for sessions with recording links
    if (allTriggerIds.length > 0) {
      triggerProcessing(allTriggerIds);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sessions.filter((s) => {
      if (fStatus !== "all" && s.processingStatus !== fStatus) return false;
      if (
        q &&
        !s.tutorName.toLowerCase().includes(q) &&
        !s.expectedStudent1.toLowerCase().includes(q) &&
        !s.subject.toLowerCase().includes(q) &&
        !s.sessionId.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [sessions, search, fStatus]);

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
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {/* Filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24, alignItems: "center" }}>
            <input
              className="apple-input"
              placeholder="Search tutor, student, subject, ID..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              style={{ maxWidth: 320, fontSize: 14 }}
            />
            <select
              className="apple-select"
              value={fStatus}
              onChange={(e) => { setFStatus(e.target.value as typeof fStatus); setPage(0); }}
              style={{ fontSize: 14 }}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="scored">Scored</option>
              <option value="approved">Approved</option>
              <option value="failed">Failed</option>
            </select>
            <span style={{ color: MUTED, fontSize: 13, marginLeft: "auto" }}>
              {filtered.length} session{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

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
