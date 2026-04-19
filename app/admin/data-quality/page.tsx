"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK } from "@/lib/types";
import { EmptyState } from "@/components/ui";

// Manager-only visibility into the data_quality_issues ledger populated
// by the backend scheduler's audit_session_linkage job (every N hours)
// and the on-demand /api/v1/sessions/audit-linkage endpoint. The five
// issue types are defined in the CHECK constraint on that table.

type IssueType =
  | "null_teacher_linkage"
  | "orphan_enrollment"
  | "unrostered_teacher"
  | "stuck_pending_review"
  | "approved_not_surfaced";

type Issue = {
  id: number;
  issueType: IssueType;
  sessionId: number | null;
  details: Record<string, unknown>;
  detectedAt: string;
};

const ISSUE_LABELS: Record<IssueType, string> = {
  null_teacher_linkage: "Null teacher linkage",
  orphan_enrollment: "Orphan enrollment",
  unrostered_teacher: "Unrostered teacher",
  stuck_pending_review: "Stuck pending review",
  approved_not_surfaced: "Approved but hidden from /teachers",
};

const ISSUE_HELP: Record<IssueType, string> = {
  null_teacher_linkage: "Session where teacher_user_id or teacher_user_name is NULL. Breaks the /teachers Product log join.",
  orphan_enrollment: "Session whose enrollment_id isn't in enrollments. Cause is usually a session upload that ran before its enrollment CSV.",
  unrostered_teacher: "Session teacher_user_id isn't in teacher_roster. Add the tutor to lib/types.ts TEACHERS and seed teacher_roster via a new migration.",
  stuck_pending_review: "Session has been scored for >3 days with no analyst review. Analyst backlog.",
  approved_not_surfaced: "Session is processing_status='approved' but has no matching approved/partially_edited draft — /teachers Product log hides it. THE bug class this audit exists to catch.",
};

export default function DataQualityPage() {
  const { flash, user } = useStore();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchIssues = useCallback(async () => {
    const { data, error } = await supabase
      .from("data_quality_issues")
      .select("id, issue_type, session_id, details, detected_at")
      .is("resolved_at", null)
      .order("issue_type", { ascending: true })
      .order("detected_at", { ascending: false });
    if (error) {
      flash(`Failed to load issues: ${error.message}`);
      setLoading(false);
      return;
    }
    setIssues(
      ((data ?? []) as {
        id: number;
        issue_type: IssueType;
        session_id: number | null;
        details: Record<string, unknown>;
        detected_at: string;
      }[]).map((r) => ({
        id: r.id,
        issueType: r.issue_type,
        sessionId: r.session_id,
        details: r.details ?? {},
        detectedAt: r.detected_at,
      }))
    );
    setLoading(false);
  }, [flash]);

  useEffect(() => {
    fetchIssues();
    const channel = supabase
      .channel("data-quality-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "data_quality_issues" },
        () => { fetchIssues(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchIssues]);

  const grouped = useMemo(() => {
    const m: Record<IssueType, Issue[]> = {
      null_teacher_linkage: [],
      orphan_enrollment: [],
      unrostered_teacher: [],
      stuck_pending_review: [],
      approved_not_surfaced: [],
    };
    for (const i of issues) m[i.issueType].push(i);
    return m;
  }, [issues]);

  async function runAuditNow() {
    const backendUrl = process.env.NEXT_PUBLIC_AI_BACKEND_URL ?? "http://localhost:8000";
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const token = authSession?.access_token;
    if (!token) {
      flash("Not authenticated");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch(
        `${backendUrl}/api/v1/sessions/audit-linkage`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        flash(`Audit failed: HTTP ${res.status}`);
        return;
      }
      const body = await res.json() as {
        null_teacher_linkage: number;
        orphan_enrollment: number;
        unrostered_teacher: number;
        stuck_pending_review: number;
        approved_not_surfaced: number;
        disabled?: number;
        already_running?: number;
      };
      if (body.disabled) {
        flash("Audit disabled via AUDIT_ENABLED=false");
      } else if (body.already_running) {
        flash("Audit already in progress — try again shortly");
      } else {
        const total =
          body.null_teacher_linkage +
          body.orphan_enrollment +
          body.unrostered_teacher +
          body.stuck_pending_review +
          body.approved_not_surfaced;
        flash(total === 0 ? "Audit clean — zero open issues" : `Audit: ${total} open issues`);
      }
      await fetchIssues();
    } catch (e) {
      flash(`Audit failed: ${String(e).slice(0, 80)}`);
    } finally {
      setRunning(false);
    }
  }

  async function resolveIssue(id: number) {
    const { error } = await supabase
      .from("data_quality_issues")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      flash(`Failed to resolve: ${error.message}`);
      return;
    }
    flash("Marked resolved");
  }

  if (user && user.role !== "manager" && user.role !== "analyst") {
    return (
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 80, minHeight: "100vh" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <EmptyState text="Data quality is visible to analysts and managers only." />
        </div>
      </section>
    );
  }

  const totalOpen = issues.length;

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p className="section-label">Admin</p>
            <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Data quality.</h1>
            <p style={{ fontSize: 15, color: MUTED, marginTop: 8 }}>
              Invariants the audit job enforces. Zero open issues = every approved session is discoverable on /teachers.
            </p>
          </div>
          <button
            type="button"
            onClick={runAuditNow}
            disabled={running}
            style={{
              background: BLUE, color: "#fff", border: "none",
              padding: "8px 20px", borderRadius: 980,
              fontSize: 14, fontWeight: 500,
              cursor: running ? "not-allowed" : "pointer",
              opacity: running ? 0.5 : 1,
            }}
          >
            {running ? "Running…" : "Run audit now"}
          </button>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {loading ? (
            <p style={{ color: MUTED, textAlign: "center", padding: 40 }}>Loading…</p>
          ) : totalOpen === 0 ? (
            <EmptyState text="No open issues. The system is healthy." />
          ) : (
            (Object.keys(grouped) as IssueType[])
              .filter((t) => grouped[t].length > 0)
              .map((t) => (
                <div key={t} style={{ marginBottom: 32 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: NEAR_BLACK }}>
                    {ISSUE_LABELS[t]} <span style={{ color: MUTED, fontWeight: 400 }}>· {grouped[t].length}</span>
                  </h2>
                  <p style={{ fontSize: 13, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
                    {ISSUE_HELP[t]}
                  </p>
                  {grouped[t].map((i) => (
                    <div
                      key={i.id}
                      style={{
                        background: LIGHT_GRAY,
                        border: "1px solid #e8e8ed",
                        borderRadius: 12,
                        padding: "14px 18px",
                        marginBottom: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 16,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: NEAR_BLACK }}>
                          {i.sessionId ? (
                            <Link href={`/sessions/${i.sessionId}`} style={{ color: BLUE, textDecoration: "none" }}>
                              Session #{i.sessionId}
                            </Link>
                          ) : (
                            "No session reference"
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                          Detected {new Date(i.detectedAt).toLocaleString()}
                        </div>
                        <pre
                          style={{
                            fontSize: 11,
                            color: NEAR_BLACK,
                            background: "#fff",
                            border: "1px solid #e8e8ed",
                            borderRadius: 8,
                            padding: "8px 10px",
                            marginTop: 8,
                            margin: "8px 0 0",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {JSON.stringify(i.details, null, 2)}
                        </pre>
                      </div>
                      <button
                        type="button"
                        onClick={() => resolveIssue(i.id)}
                        style={{
                          background: "#fff", color: BLUE,
                          border: `1px solid ${BLUE}`,
                          padding: "6px 14px", borderRadius: 980,
                          fontSize: 12, fontWeight: 500, cursor: "pointer",
                        }}
                      >
                        Mark resolved
                      </button>
                    </div>
                  ))}
                </div>
              ))
          )}
        </div>
      </section>
    </>
  );
}
