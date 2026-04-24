"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import DraftReview from "@/components/draft-review";
import { ScorecardReport } from "@/components/scorecard-report";
import SalesInput from "@/components/sales-input";
import SalesFeedbackReport from "@/components/sales-feedback-report";
import { isFinalized } from "@/lib/scorecard";
import { BLUE, LIGHT_GRAY, MUTED, NEAR_BLACK, type DemoDraft } from "@/lib/types";

export default function AnalystReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const demoId = Number(id);
  const { demos, draftsByDemoId, fetchDraft, triggerAnalyze, triggerProcessRecording, flash, user, confirmDeleteDemo } = useStore();
  const router = useRouter();
  const [draft, setDraft] = useState<DemoDraft | null>(
    () => draftsByDemoId[demoId] ?? null
  );
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analystEditMode, setAnalystEditMode] = useState(false);
  const [processingRecording, setProcessingRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [salesEditMode, setSalesEditMode] = useState(false);

  const demo = demos.find((d) => d.id === demoId);

  // If no draft in local state (e.g., direct navigation), try fetching once
  useEffect(() => {
    if (draft || lookupAttempted) return;
    let cancelled = false;
    fetchDraft(demoId).then((fetched) => {
      if (cancelled) return;
      setDraft(fetched);
      setLookupAttempted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [demoId, draft, lookupAttempted, fetchDraft]);

  // Keep local in sync with store when realtime delivers
  useEffect(() => {
    const fromStore = draftsByDemoId[demoId];
    if (fromStore && (!draft || fromStore.id !== draft.id)) {
      setDraft(fromStore);
    }
  }, [draftsByDemoId, demoId, draft]);

  // Auto-trigger analysis when transcript exists but no draft yet.
  // Gate on lookupAttempted so we only POST to the backend after the DB
  // round-trip has resolved — otherwise we race fetchDraft and fire analyze
  // even when a draft already exists.
  // Sales agents never trigger analyze — the backend auto-approves on ingest.
  useEffect(() => {
    if (!demo || draft || autoTriggered || !lookupAttempted) return;
    if (user?.role !== "analyst" && user?.role !== "manager") return;
    if (demo.transcript && demo.transcript.trim()) {
      setAutoTriggered(true);
      setAnalyzing(true);
      setAnalyzeError(null);
      triggerAnalyze(demoId).then((res) => {
        setAnalyzing(false);
        if (res.ok) setDraft(res.draft);
        else setAnalyzeError(res.error);
      });
    }
  }, [demo, draft, autoTriggered, lookupAttempted, demoId, triggerAnalyze, flash, user]);

  const retryAnalyze = () => {
    if (!demo?.transcript?.trim()) return;
    setAutoTriggered(true);
    setAnalyzing(true);
    setAnalyzeError(null);
    triggerAnalyze(demoId).then((res) => {
      setAnalyzing(false);
      if (res.ok) setDraft(res.draft);
      else setAnalyzeError(res.error);
    });
  };

  const retryProcessRecording = () => {
    if (!demo?.recording?.trim()) return;
    setProcessingRecording(true);
    setRecordingError(null);
    triggerProcessRecording(demoId).then((res) => {
      setProcessingRecording(false);
      if (!res.ok) setRecordingError(res.error);
    });
  };

  const canDelete = user?.role === "manager";

  const handleDelete = () => {
    if (!demo) return;
    confirmDeleteDemo(demo, { onAfterDelete: () => router.push("/") });
  };

  if (!demo) {
    return (
      <main style={{ background: LIGHT_GRAY, minHeight: "100vh", paddingTop: 92 }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
          <p className="section-label">Demo not found</p>
          <h1 style={{ fontSize: 32, fontWeight: 600, marginTop: 8 }}>
            Demo {demoId} is not in your queue.
          </h1>
          <p style={{ fontSize: 15, color: MUTED, marginTop: 12 }}>
            It may not exist, or your role doesn&apos;t have access.
          </p>
          <Link
            href="/"
            className="pill pill-blue"
            style={{ display: "inline-block", marginTop: 20, padding: "10px 20px", fontSize: 14 }}
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const canEditAnalyst = user?.role === "analyst" || user?.role === "manager";
  const canEditSales = user?.role === "sales_agent" || user?.role === "manager";
  const finalized = draft ? isFinalized(draft) : false;
  const showDraftEditor = !!draft && (!finalized || analystEditMode);

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 24 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link
              href="/"
              style={{ fontSize: 13, color: BLUE, textDecoration: "none" }}
            >
              ← Back to dashboard
            </Link>
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="pill pill-outline"
                style={{ fontSize: 12, padding: "5px 14px", color: "#B42318", borderColor: "#FDA29B" }}
              >
                Delete demo
              </button>
            )}
          </div>
          <p className="section-label" style={{ marginTop: 12 }}>
            Demo {demoId} · {finalized ? "QA scorecard report" : "AI-assisted review"}
          </p>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 600,
              lineHeight: 1.1,
              marginTop: 6,
            }}
          >
            {demo.student}
          </h1>
          <p style={{ fontSize: 15, color: MUTED, marginTop: 4 }}>
            {demo.teacher} · {demo.level} {demo.grade ? `· ${demo.grade} ` : ""}· {demo.subject} · {demo.date}
          </p>
        </div>
      </section>

      <section style={{ background: LIGHT_GRAY, padding: "8px 24px 60px" }}>
        {/* ─── Analyst scorecard section ─────────────────────────── */}
        {canEditAnalyst ? (
          /* Analyst / manager — full editing experience */
          !draft ? (
            <AnalystEmpty demo={demo} analyzing={analyzing} analyzeError={analyzeError} onRetry={retryAnalyze} canAnalyze={canEditAnalyst} processingRecording={processingRecording} recordingError={recordingError} onRetryProcessing={retryProcessRecording} />
          ) : showDraftEditor ? (
            <>
              {finalized && analystEditMode && (
                <div style={{ maxWidth: 1300, margin: "0 auto 12px" }}>
                  <button
                    type="button"
                    onClick={() => setAnalystEditMode(false)}
                    className="pill pill-outline"
                    style={{ fontSize: 12, padding: "5px 14px" }}
                  >
                    ← Cancel edit, view report
                  </button>
                </div>
              )}
              <DraftReview demo={demo} draft={draft} />
            </>
          ) : (
            <>
              <ScorecardReport demo={demo} draft={draft} />
              <div
                style={{
                  maxWidth: 1300,
                  margin: "12px auto 0",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => setAnalystEditMode(true)}
                  className="pill pill-outline"
                  style={{ fontSize: 12, padding: "5px 14px" }}
                >
                  Edit scorecard
                </button>
              </div>
            </>
          )
        ) : (
          /* Sales agent — progressive status display */
          <SalesProgressStatus
            demo={demo}
            draft={draft}
            processingRecording={processingRecording}
            analyzing={analyzing}
            onRetryProcessing={retryProcessRecording}
            recordingError={recordingError}
          />
        )}

        {/* ─── Sales feedback section ─────────────────────────────── */}
        <div style={{ marginTop: 32 }}>
          {canEditSales ? (
            hasSalesFeedback(demo) && !salesEditMode ? (
              <>
                <SalesFeedbackReport demo={demo} />
                <div style={{ maxWidth: 640, margin: "12px auto 0" }}>
                  <button
                    type="button"
                    onClick={() => setSalesEditMode(true)}
                    className="pill pill-outline"
                    style={{ fontSize: 12, padding: "5px 14px" }}
                  >
                    Edit feedback
                  </button>
                </div>
              </>
            ) : (
              <SalesInput demo={demo} />
            )
          ) : (
            <SalesFeedbackReport demo={demo} />
          )}
        </div>
      </section>
    </>
  );
}

function hasSalesFeedback(demo: { feedbackRating: number; feedbackExplanation: boolean | null; feedbackParticipation: boolean | null; feedbackConfused: boolean | null; feedbackUncomfortable: boolean | null; feedbackPositiveEnv: boolean | null; feedbackSuggestions: string; feedbackComments: string }): boolean {
  return (
    demo.feedbackRating > 0 ||
    demo.feedbackExplanation !== null ||
    demo.feedbackParticipation !== null ||
    demo.feedbackConfused !== null ||
    demo.feedbackUncomfortable !== null ||
    demo.feedbackPositiveEnv !== null ||
    demo.feedbackSuggestions.trim() !== "" ||
    demo.feedbackComments.trim() !== ""
  );
}

function SalesProgressStatus({
  demo,
  draft,
  processingRecording,
  analyzing,
  onRetryProcessing,
  recordingError,
}: {
  demo: { recording: string; transcript: string | null };
  draft: DemoDraft | null;
  processingRecording: boolean;
  analyzing: boolean;
  onRetryProcessing: () => void;
  recordingError: string | null;
}) {
  const hasRecording = !!demo.recording?.trim();
  const hasTranscript = !!demo.transcript?.trim();
  const finalized = draft ? isFinalized(draft) : false;

  let label: string;
  let subtitle: string;
  let color: string;
  let bgColor: string;

  if (finalized) {
    label = "Analyst Approved";
    subtitle = "The scorecard has been reviewed and finalized by the analyst.";
    color = "#1B5E20";
    bgColor = "#E8F5E9";
  } else if (draft) {
    label = "Pending Analyst Approval";
    subtitle = "AI scorecard generated — awaiting analyst review and approval.";
    color = "#8B6914";
    bgColor = "#FFF8E1";
  } else if (hasTranscript || analyzing) {
    label = "AI Scorecard Generator";
    subtitle = analyzing
      ? "Generating AI scorecard from transcript — this usually takes 10–30 seconds…"
      : "Transcript ready — AI scorecard will be generated shortly.";
    color = "#6A1B9A";
    bgColor = "#F3E5F5";
  } else if (hasRecording || processingRecording) {
    label = "Fetching Recording";
    subtitle = processingRecording
      ? "Processing recording — transcription may take 1–3 minutes."
      : recordingError
      ? recordingError
      : "Recording link provided — click below to start processing.";
    color = "#01579B";
    bgColor = "#E1F5FE";
  } else {
    label = "Awaiting Recording";
    subtitle = "No recording link provided yet. Analyst can add one to enable AI analysis.";
    color = MUTED;
    bgColor = "#fff";
  }

  const hasError = !!recordingError && !processingRecording && hasRecording && !hasTranscript;

  return (
    <div
      style={{
        maxWidth: 1300,
        margin: "0 auto",
        padding: "32px 24px",
        background: bgColor,
        border: "1px dashed " + (hasError ? "#E24B4A" : "#e8e8ed"),
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color }}>
        {label}
      </p>
      <p style={{ fontSize: 14, color: hasError ? "#c13030" : NEAR_BLACK, marginTop: 10, lineHeight: 1.5 }}>
        {subtitle}
      </p>
      {hasRecording && !hasTranscript && !processingRecording && (
        <button
          onClick={onRetryProcessing}
          className="pill pill-blue"
          style={{ marginTop: 16, padding: "8px 20px", fontSize: 13 }}
        >
          {recordingError ? "Retry Processing" : "Process Recording"}
        </button>
      )}
    </div>
  );
}

function AnalystEmpty({
  demo,
  analyzing,
  analyzeError,
  onRetry,
  canAnalyze,
  processingRecording,
  recordingError,
  onRetryProcessing,
}: {
  demo: { recording: string; transcript: string | null };
  analyzing: boolean;
  analyzeError: string | null;
  onRetry: () => void;
  canAnalyze: boolean;
  processingRecording: boolean;
  recordingError: string | null;
  onRetryProcessing: () => void;
}) {
  const hasRecording = !!demo.recording?.trim();
  const hasTranscript = !!demo.transcript?.trim();

  let msg: string;
  if (processingRecording) {
    msg = "Processing recording — AI will generate a scorecard automatically. This may take 1–3 minutes.";
  } else if (recordingError) {
    msg = recordingError;
  } else if (analyzing) {
    msg = "Analyzing transcript — this usually takes 10–30 seconds…";
  } else if (analyzeError) {
    msg = analyzeError;
  } else if (hasRecording && !hasTranscript) {
    msg = "Recording link provided. Click 'Process Recording' to start AI analysis.";
  } else if (hasTranscript) {
    msg = canAnalyze
      ? "Transcript ready. Click Analyze to generate the AI scorecard."
      : "Transcript available — awaiting analyst scorecard.";
  } else {
    msg = "No recording link provided yet. Analyst can add one to enable AI analysis.";
  }

  const hasError = !!(recordingError || analyzeError);

  return (
    <div
      style={{
        maxWidth: 1300,
        margin: "0 auto",
        padding: "32px 24px",
        background: "#fff",
        border: "1px dashed #e8e8ed",
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <p className="section-label">No AI draft yet</p>
      <p style={{ fontSize: 14, color: hasError ? "#c13030" : MUTED, marginTop: 10, lineHeight: 1.5 }}>
        {msg}
      </p>
      {/* Process Recording — visible to all roles when recording exists but transcript hasn't been generated yet */}
      {hasRecording && !hasTranscript && !processingRecording && (
        <button
          onClick={onRetryProcessing}
          className="pill pill-blue"
          style={{ marginTop: 16, padding: "8px 20px", fontSize: 13 }}
        >
          {recordingError ? "Retry Processing" : "Process Recording"}
        </button>
      )}
      {/* Analyze — only for analysts/managers once transcript exists */}
      {!analyzing && hasTranscript && canAnalyze && (
        <button
          onClick={onRetry}
          className="pill pill-blue"
          style={{ marginTop: 16, padding: "8px 20px", fontSize: 13 }}
        >
          {analyzeError ? "Retry analysis" : "Analyze"}
        </button>
      )}
    </div>
  );
}
