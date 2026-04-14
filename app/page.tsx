"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { StatusBadge } from "@/components/ui";
import { initials } from "@/lib/utils";
import { NEAR_BLACK, LIGHT_GRAY, MUTED, BLUE } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const {
    stats,
    rangedDemos,
    activity,
    dateRange,
    user,
    draftsByDemoId,
    triggerAnalyze,
    triggerProcessRecording,
    flash,
    logActivity,
  } = useStore();
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const canAnalyze = user?.role === "analyst" || user?.role === "manager";

  // Fix 6 — for managers: count demos sitting in pending_sales with no sales agent.
  // Auto-assign (analyst form, Fix 2) should prevent new ones, but seed data
  // and legacy rows may still need manual attention.
  const unassignedSalesCount = useMemo(() => {
    if (user?.role !== "manager") return 0;
    return rangedDemos.filter(
      (d) => d.workflowStage === "pending_sales" && !d.salesAgentId
    ).length;
  }, [user?.role, rangedDemos]);

  const onAnalyze = async (demoId: number) => {
    setAnalyzingId(demoId);
    const res = await triggerAnalyze(demoId);
    setAnalyzingId(null);
    if (!res.ok) {
      flash(res.error);
      return;
    }
    router.push(`/analyst/${demoId}`);
  };

  const onProcessRecording = async (demoId: number) => {
    const demo = rangedDemos.find((d) => d.id === demoId);
    const studentLabel = demo?.student ?? `Demo ${demoId}`;
    setProcessingId(demoId);
    logActivity("started processing", user?.full_name ?? "System", studentLabel);
    const res = await triggerProcessRecording(demoId);
    setProcessingId(null);
    if (!res.ok) {
      logActivity("processing failed", "AI", `${studentLabel} — ${res.error}`);
      flash(res.error);
      return;
    }
    if (res.status === "transcription_only") {
      logActivity(
        "processing partial",
        "AI",
        `${studentLabel} — transcript saved, analysis failed`,
      );
      flash("Transcript saved. Auto-analysis failed — click Analyze to retry.");
      return;
    }
    logActivity("processing complete", "AI", `${studentLabel} — scorecard ready`);
    router.push(`/analyst/${demoId}`);
  };

  const emptyMessage =
    user?.role === "sales_agent"
      ? "No demos assigned to you yet. Demos will appear here once an analyst submits a review and it's routed to you."
      : user?.role === "analyst"
      ? "No demos in your queue. Claim a demo from the unassigned pool or wait for auto-assignment."
      : "No demos match the current filter.";

  return (
    <>
      {/* Hero */}
      <section style={{ background: "#000", color: "#fff", paddingTop: 104, paddingBottom: 64, textAlign: "center" }}>
        <div className="animate-fade-up" style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label" style={{ color: MUTED }}>Demo to Conversion</p>
          <h1 style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.07, letterSpacing: "-0.28px", marginTop: 6 }}>
            Analysis Platform
          </h1>
          <p style={{ fontSize: 21, fontWeight: 400, lineHeight: 1.19, color: "rgba(255,255,255,.6)", marginTop: 16 }}>
            Track, evaluate, and convert demo sessions into enrollments.
          </p>
          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center" }}>
            <Link href="/analyst" className="pill pill-blue">New demo review</Link>
            <Link href="/kanban" className="pill pill-white">Kanban board</Link>
          </div>
          {dateRange !== "all" && (
            <p style={{ fontSize: 12, color: MUTED, marginTop: 16 }}>Showing: last {dateRange}</p>
          )}
        </div>
      </section>

      {/* KPIs */}
      <section style={{ background: LIGHT_GRAY, padding: "44px 24px" }}>
        <div className="animate-fade-up-1" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          {[
            { l: "Total demos", v: stats.total, c: NEAR_BLACK },
            { l: "Conversion rate", v: stats.rate + "%", c: stats.rate >= 40 ? "#1b8a4a" : "#B25000" },
            { l: "Pending", v: stats.pending, c: "#B25000" },
            { l: "Avg. rating", v: stats.avgR + "/5", c: BLUE },
            { l: "POUR rate", v: stats.pourRate + "%", c: "#AF52DE" },
            { l: "Not converted", v: stats.notConv, c: "#c13030" },
          ].map((m, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "18px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1, color: m.c }}>{m.v}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: MUTED, marginTop: 5 }}>{m.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent + Activity */}
      <section style={{ background: "#fff", padding: "44px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,300px)", gap: 24 }}>
          <div>
            {unassignedSalesCount > 0 && (
              <Link
                href="/sales"
                style={{
                  display: "block",
                  padding: "10px 14px",
                  marginBottom: 16,
                  borderRadius: 10,
                  background: "#FFF8E1",
                  border: "1px solid #F5D98E",
                  color: "#8B6914",
                  fontSize: 13,
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                ⚠ {unassignedSalesCount} demo{unassignedSalesCount === 1 ? "" : "s"} in Pending sales with no sales agent — click to assign
              </Link>
            )}
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Recent demos</h2>
            {rangedDemos.length === 0 && (
              <div style={{ padding: "32px 20px", textAlign: "center", background: LIGHT_GRAY, borderRadius: 12, color: MUTED, fontSize: 13, lineHeight: 1.47 }}>
                {emptyMessage}
              </div>
            )}
            {rangedDemos.slice(0, 6).map((d) => {
              const draft = draftsByDemoId[d.id];
              const hasTranscript = !!(d.transcript && d.transcript.trim());
              const hasRecording = !!(d.recording && d.recording.trim());
              // Reviewed = the analyst has finalized this draft (approved or
              // edited some fields). Rejected drafts fall through and show
              // "Analyze" so the analyst can re-run the AI.
              const reviewed =
                draft && (draft.status === "approved" || draft.status === "partially_edited");
              const pendingReview = draft && draft.status === "pending_review";
              const canReanalyze = !draft || draft.status === "rejected";
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: LIGHT_GRAY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
                      {initials(d.student)}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{d.student}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>{d.teacher} · {d.subject} · {d.date}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {canAnalyze && reviewed && (
                      <Link
                        href={`/analyst/${d.id}`}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#1B5E20",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          textDecoration: "none",
                        }}
                        title="View scorecard report"
                      >
                        ✓ Reviewed
                      </Link>
                    )}
                    {canAnalyze && pendingReview && (
                      <Link
                        href={`/analyst/${d.id}`}
                        className="pill pill-outline"
                        style={{ padding: "4px 12px", fontSize: 12 }}
                      >
                        Review draft
                      </Link>
                    )}
                    {canAnalyze && hasTranscript && canReanalyze && (
                      <button
                        onClick={() => onAnalyze(d.id)}
                        disabled={analyzingId === d.id}
                        className="pill pill-outline"
                        style={{
                          padding: "4px 12px",
                          fontSize: 12,
                          opacity: analyzingId === d.id ? 0.6 : 1,
                          cursor: analyzingId === d.id ? "default" : "pointer",
                        }}
                      >
                        {analyzingId === d.id ? "Analyzing…" : "Analyze"}
                      </button>
                    )}
                    {canAnalyze && !hasTranscript && hasRecording && canReanalyze && (
                      <button
                        onClick={() => onProcessRecording(d.id)}
                        disabled={processingId === d.id}
                        className="pill pill-outline"
                        style={{
                          padding: "4px 12px",
                          fontSize: 12,
                          opacity: processingId === d.id ? 0.6 : 1,
                          cursor: processingId === d.id ? "default" : "pointer",
                        }}
                        title="Download recording, transcribe, and auto-analyze"
                      >
                        {processingId === d.id ? "Processing… (1–3 min)" : "Process recording"}
                      </button>
                    )}
                    <StatusBadge status={d.status} />
                  </div>
                </div>
              );
            })}
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Activity log</h2>
            {activity.slice(0, 8).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f7", alignItems: "start" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.action === "converted" ? "#30D158" : a.action.includes("escalat") ? "#FF3B30" : BLUE, flexShrink: 0, marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                    <strong>{a.user}</strong> {a.action} <span style={{ color: BLUE }}>{a.target}</span>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
