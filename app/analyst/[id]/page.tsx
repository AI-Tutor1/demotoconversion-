"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import DraftReview from "@/components/draft-review";
import { ScorecardReport } from "@/components/scorecard-report";
import { isFinalized } from "@/lib/scorecard";
import { BLUE, LIGHT_GRAY, MUTED, type DemoDraft } from "@/lib/types";

export default function AnalystReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const demoId = Number(id);
  const { demos, draftsByDemoId, fetchDraft, triggerAnalyze, flash } = useStore();
  const [draft, setDraft] = useState<DemoDraft | null>(
    () => draftsByDemoId[demoId] ?? null
  );
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

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

  const onAnalyze = async () => {
    if (!demo) return;
    setAnalyzing(true);
    const res = await triggerAnalyze(demoId);
    setAnalyzing(false);
    if (!res.ok) {
      flash(res.error);
      return;
    }
    setDraft(res.draft);
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
            It may not exist, or your role doesn't have access.
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

  if (!draft) {
    return (
      <main style={{ background: LIGHT_GRAY, minHeight: "100vh", paddingTop: 92 }}>
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <p className="section-label">No AI draft yet</p>
          <h1 style={{ fontSize: 32, fontWeight: 600, marginTop: 8 }}>
            {demo.student}
          </h1>
          <p style={{ fontSize: 15, color: MUTED, marginTop: 8 }}>
            {demo.teacher} · {demo.level} {demo.subject}
          </p>
          <p style={{ fontSize: 15, color: MUTED, marginTop: 24, lineHeight: 1.47 }}>
            {demo.transcript
              ? "This demo has a transcript but hasn't been analyzed yet."
              : "This demo has no transcript — upload one before running the AI agent."}
          </p>
          {demo.transcript && (
            <button
              onClick={onAnalyze}
              className="pill pill-blue"
              style={{
                marginTop: 20,
                padding: "10px 22px",
                fontSize: 14,
                opacity: analyzing ? 0.6 : 1,
                cursor: analyzing ? "default" : "pointer",
              }}
              disabled={analyzing}
            >
              {analyzing ? "Analyzing… (5-30s)" : "Analyze with AI"}
            </button>
          )}
          <div style={{ marginTop: 16 }}>
            <Link
              href="/"
              style={{ fontSize: 13, color: BLUE, textDecoration: "none" }}
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Header + split view. After approval, render the read-only report
  // instead of the editable draft so the page becomes a permanent record
  // any role with link access can revisit.
  const finalized = isFinalized(draft);

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 24 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 24px" }}>
          <Link
            href="/"
            style={{ fontSize: 13, color: BLUE, textDecoration: "none" }}
          >
            ← Back to dashboard
          </Link>
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
            {demo.teacher} · {demo.level} {demo.subject} · {demo.date}
          </p>
        </div>
      </section>

      <section style={{ background: LIGHT_GRAY, padding: "8px 24px 60px" }}>
        {finalized ? (
          <ScorecardReport demo={demo} draft={draft} />
        ) : (
          <DraftReview demo={demo} draft={draft} />
        )}
      </section>
    </>
  );
}
