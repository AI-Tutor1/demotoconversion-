"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK } from "@/lib/types";
import type { Session, SessionDraft } from "@/lib/types";
import { dbRowToSession } from "@/lib/review-transforms";
import SessionStatusBadge from "@/components/session-status-badge";
import SessionDraftReview from "@/components/session-draft-review";
import { EmptyState } from "@/components/ui";
import { interpretationBadge, Q_KEYS, Q_META, scoreColor } from "@/lib/scorecard";

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { flash, user, confirmDeleteSession } = useStore();
  const sessionId = Number(params.id);

  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    if (!session) return;
    const backendUrl = process.env.NEXT_PUBLIC_AI_BACKEND_URL ?? "http://localhost:8000";
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const token = authSession?.access_token;
    if (!token) {
      flash("Not authenticated");
      return;
    }
    // Smart dispatch: if transcript exists, the ingest step already succeeded
    // (analyst must have failed) — retry analyst-only via /analyze to avoid
    // re-downloading + re-transcribing, which would burn Whisper quota.
    // No transcript → full /process-recording path.
    const hasTranscript = !!session.transcript && session.transcript.trim().length > 0;
    const endpoint = hasTranscript ? "analyze" : "process-recording";
    setRetrying(true);
    try {
      const res = await fetch(
        `${backendUrl}/api/v1/sessions/${session.id}/${endpoint}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        flash(hasTranscript ? "Re-analyzing transcript…" : "Retry queued — the pipeline will run in the background");
      } else if (res.status === 409) {
        flash("Processing is already in progress for this session");
      } else {
        const body = await res.text().catch(() => "");
        flash(`Retry failed: ${res.status} ${body.slice(0, 80)}`);
      }
    } catch (e) {
      flash(`Retry failed: ${String(e).slice(0, 80)}`);
    } finally {
      setRetrying(false);
    }
  }

  const fetchData = useCallback(async () => {
    const { data: sData, error: sErr } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .limit(1)
      .single();
    if (sErr || !sData) {
      flash("Session not found");
      router.push("/sessions");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSession(dbRowToSession(sData as any));

    // Fetch latest draft
    const { data: dData } = await supabase
      .from("session_drafts")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (dData && dData.length > 0) {
      setDraft(dData[0] as unknown as SessionDraft);
    }
    setLoading(false);
  }, [sessionId, flash, router]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`session-detail-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "session_drafts", filter: `session_id=eq.${sessionId}` }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, fetchData]);

  if (loading) {
    return (
      <section style={{ paddingTop: 120, textAlign: "center" }}>
        <p style={{ color: MUTED }}>Loading session...</p>
      </section>
    );
  }

  if (!session) {
    return (
      <section style={{ paddingTop: 120 }}>
        <EmptyState text="Session not found" />
      </section>
    );
  }

  const isFinalized = draft && (draft.status === "approved" || draft.status === "partially_edited");
  const isPendingReview = draft && draft.status === "pending_review";

  return (
    <>
      {/* Hero */}
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link href="/sessions" style={{ fontSize: 13, color: BLUE, textDecoration: "none" }}>
              ← Back to Sessions
            </Link>
            {user?.role === "manager" && (
              <button
                type="button"
                onClick={() =>
                  confirmDeleteSession(session.id, session.sessionId, {
                    onAfterDelete: () => router.push("/sessions"),
                  })
                }
                className="pill pill-outline"
                style={{ fontSize: 12, padding: "5px 14px", color: "#B42318", borderColor: "#FDA29B" }}
              >
                Delete session
              </button>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 12, flexWrap: "wrap", gap: 16 }}>
            <div>
              <p className="section-label">Session Detail</p>
              <h1 style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.15 }}>
                {session.tutorName || "Unknown Tutor"}
              </h1>
              <p style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>
                {session.expectedStudent1}{session.subject ? ` · ${session.subject}` : ""}{session.sessionDate ? ` · ${session.sessionDate}` : ""}
              </p>
            </div>
            <SessionStatusBadge status={session.processingStatus} />
          </div>

          {/* Metadata grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 20 }}>
            {[
              { label: "Session ID", value: session.sessionId },
              { label: "Enrollment", value: session.enrollmentId },
              { label: "Grade", value: session.grade },
              { label: "Board", value: session.board },
              { label: "Curriculum", value: session.curriculum },
              { label: "Class Status", value: session.classStatus },
            ].map((item) => (
              <div key={item.label} style={{ background: "#fff", borderRadius: 10, padding: "10px 14px" }}>
                <div className="section-label" style={{ marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: NEAR_BLACK }}>{item.value || "—"}</div>
              </div>
            ))}
          </div>

          {/* Recording link */}
          {session.recordingLink && (
            <div style={{ marginTop: 12 }}>
              <a
                href={session.recordingLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, color: BLUE, textDecoration: "none" }}
              >
                🎥 View Recording →
              </a>
            </div>
          )}

          {/* Notes */}
          {session.notes && (
            <div style={{ marginTop: 12, background: "#fff", borderRadius: 10, padding: "10px 14px" }}>
              <div className="section-label" style={{ marginBottom: 4 }}>Notes</div>
              <p style={{ fontSize: 13, color: NEAR_BLACK, margin: 0, lineHeight: 1.5 }}>{session.notes}</p>
            </div>
          )}
        </div>
      </section>

      {/* Content */}
      <section style={{ background: "#fff", padding: "32px 24px 80px" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          {/* No draft, no recording */}
          {!draft && !session.recordingLink && (
            <EmptyState text="No recording link available for this session." />
          )}

          {/* No draft, has recording, still processing */}
          {!draft && session.recordingLink && (session.processingStatus === "processing" || session.processingStatus === "pending") && (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <p style={{ fontSize: 16, fontWeight: 500, color: NEAR_BLACK }}>
                {session.processingStatus === "processing" ? "Processing recording..." : "Waiting to process..."}
              </p>
              <p style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
                The AI is analyzing this session. The scorecard will appear here automatically.
              </p>
              {session.processingStatus === "pending" && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  className="pill pill-blue"
                  style={{ marginTop: 18, padding: "8px 20px", fontSize: 13, background: BLUE, color: "#fff", border: "none", borderRadius: 980, cursor: retrying ? "not-allowed" : "pointer", opacity: retrying ? 0.5 : 1 }}
                >
                  {retrying ? "Queuing..." : "Process now"}
                </button>
              )}
            </div>
          )}

          {/* Failed processing */}
          {!draft && session.processingStatus === "failed" && (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <p style={{ fontSize: 16, fontWeight: 500, color: "#c13030" }}>Processing failed</p>
              <p style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
                The recording could not be processed. Check the recording link and try again.
              </p>
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="pill pill-blue"
                style={{ marginTop: 18, padding: "8px 20px", fontSize: 13, background: BLUE, color: "#fff", border: "none", borderRadius: 980, cursor: retrying ? "not-allowed" : "pointer", opacity: retrying ? 0.5 : 1 }}
              >
                {retrying ? "Retrying..." : "Retry processing"}
              </button>
            </div>
          )}

          {/* Pending review — show editable scorecard */}
          {isPendingReview && !editing && (
            <SessionDraftReview
              sessionId={sessionId}
              draft={draft}
              transcript={session.transcript}
              onApproved={fetchData}
            />
          )}

          {/* Finalized — show read-only scorecard */}
          {isFinalized && !editing && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 22, fontWeight: 600, color: NEAR_BLACK }}>Session Scorecard</h2>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="pill pill-outline"
                  style={{ padding: "6px 14px", fontSize: 13 }}
                >
                  Edit scorecard
                </button>
              </div>
              <ReadOnlyScorecard draft={draft} />
            </div>
          )}

          {/* Re-editing a finalized scorecard */}
          {isFinalized && editing && (
            <SessionDraftReview
              sessionId={sessionId}
              draft={draft}
              transcript={session.transcript}
              onApproved={() => { setEditing(false); fetchData(); }}
            />
          )}
        </div>
      </section>
    </>
  );
}

function ReadOnlyScorecard({ draft }: { draft: SessionDraft }) {
  const d = draft.draft_data;
  const total = d.total_score;
  const badge = interpretationBadge(total);

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Total */}
      <div style={{ background: "#fff", border: "1px solid #e8e8ed", borderRadius: 14, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, color: NEAR_BLACK }}>{total}</span>
        <span style={{ fontSize: 14, color: MUTED }}>/ 32</span>
        <span style={{ marginLeft: 10, padding: "3px 12px", borderRadius: 980, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.fg }}>{badge.label}</span>
        {draft.approval_rate != null && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>
            {Math.round(draft.approval_rate * 100)}% accepted
          </span>
        )}
      </div>

      {/* Q1-Q8 grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {Q_KEYS.map((k) => {
          const meta = Q_META[k];
          const v = d[k];
          const color = scoreColor(v.score, meta.max);
          return (
            <div key={k} style={{ background: "#fff", border: "1px solid #e8e8ed", borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: NEAR_BLACK }}>{meta.label}</span>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>
                  {v.score}
                </div>
              </div>
              <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.45, margin: 0 }}>{v.evidence || "—"}</p>
            </div>
          );
        })}
      </div>

      {/* POUR + Summary */}
      {d.pour_issues.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p className="section-label" style={{ marginBottom: 6 }}>POUR Issues</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {d.pour_issues.map((p, i) => (
              <span key={i} className="pour-tag">{p.category}{p.description ? `: ${p.description}` : ""}</span>
            ))}
          </div>
        </div>
      )}

      {d.overall_summary && (
        <div style={{ marginTop: 16 }}>
          <p className="section-label" style={{ marginBottom: 4 }}>Summary</p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: NEAR_BLACK, margin: 0 }}>{d.overall_summary}</p>
        </div>
      )}

      {d.improvement_suggestions && (
        <div style={{ marginTop: 12 }}>
          <p className="section-label" style={{ marginBottom: 4 }}>Improvement Suggestions</p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: NEAR_BLACK, margin: 0 }}>{d.improvement_suggestions}</p>
        </div>
      )}
    </div>
  );
}
