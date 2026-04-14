"use client";
import { useState, useMemo, useEffect } from "react";
import { useStore } from "@/lib/store";
import { StatusBadge, Field, EmptyState } from "@/components/ui";
import { ScorecardSummary } from "@/components/scorecard-summary";
import { SearchableSelect } from "@/components/searchable-select";
import { TEACHERS, ACCT_TYPES, MUTED, BLUE, LIGHT_GRAY, NEAR_BLACK, type Demo } from "@/lib/types";
import { isFinalized } from "@/lib/scorecard";
import { ageDays, ageColor, ageTextColor, formatMonth, exportCSV } from "@/lib/utils";

// ─── Inline UI helpers used only on this page ─────────────────────────

function RatingPills({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 980,
              border: "1px solid " + (active ? BLUE : "#e8e8ed"),
              background: active ? BLUE : "#fff",
              color: active ? "#fff" : NEAR_BLACK,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  const baseBtn = (active: boolean, color: string, label: string, val: boolean) => (
    <button
      type="button"
      onClick={() => onChange(val)}
      style={{
        padding: "5px 18px",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 980,
        border: "1px solid " + (active ? color : "#e8e8ed"),
        background: active ? color : "#fff",
        color: active ? "#fff" : MUTED,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {baseBtn(value === true, "#30D158", "Yes", true)}
      {baseBtn(value === false, "#E24B4A", "No", false)}
    </div>
  );
}

// Question card wrapper — consistent spacing + label rendering
function FeedbackQ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e8e8ed",
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 12,
      }}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: NEAR_BLACK,
          lineHeight: 1.47,
          marginBottom: 10,
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

// ─── Sales form state shape ───────────────────────────────────────────

interface SalesForm {
  status: "Converted" | "Not Converted" | "Pending";
  salesAgentId: string;
  marketing: boolean;
  acctType: string;
  link: string;
  feedbackRating: number;
  feedbackExplanation: boolean | null;
  feedbackExplanationComment: string;
  feedbackParticipation: boolean | null;
  feedbackParticipationComment: string;
  feedbackConfused: boolean | null;
  feedbackConfusedDetail: string;
  feedbackUncomfortable: boolean | null;
  feedbackUncomfortableDetail: string;
  feedbackPositiveEnv: boolean | null;
  feedbackPositiveEnvComment: string;
  feedbackSuggestions: string;
  feedbackComments: string;
}

const blankSF: SalesForm = {
  status: "Converted",
  salesAgentId: "",
  marketing: false,
  acctType: "",
  link: "",
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

function fromDemo(d: Demo): SalesForm {
  return {
    status: d.status,
    salesAgentId: d.salesAgentId ?? "",
    marketing: d.marketing,
    acctType: d.acctType,
    link: d.link,
    feedbackRating: d.feedbackRating,
    feedbackExplanation: d.feedbackExplanation,
    feedbackExplanationComment: d.feedbackExplanationComment,
    feedbackParticipation: d.feedbackParticipation,
    feedbackParticipationComment: d.feedbackParticipationComment,
    feedbackConfused: d.feedbackConfused,
    feedbackConfusedDetail: d.feedbackConfusedDetail,
    feedbackUncomfortable: d.feedbackUncomfortable,
    feedbackUncomfortableDetail: d.feedbackUncomfortableDetail,
    feedbackPositiveEnv: d.feedbackPositiveEnv,
    feedbackPositiveEnvComment: d.feedbackPositiveEnvComment,
    feedbackSuggestions: d.feedbackSuggestions,
    feedbackComments: d.feedbackComments,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { rangedDemos, setDemos, flash, setConfirm, logActivity, salesAgents, draftsByDemoId } = useStore();
  const [selDemo, setSelDemo] = useState<number | null>(null);
  const [bulkSel, setBulkSel] = useState<number[]>([]);
  const [fStatus, setFStatus] = useState("All");
  const [fTeacher, setFTeacher] = useState("");
  const [fAgent, setFAgent] = useState("");
  const [sort, setSort] = useState("date-desc");
  const [sf, setSf] = useState<SalesForm>(blankSF);

  const sel = rangedDemos.find((d) => d.id === selDemo);

  // Re-initialize the form when the user opens a different demo, so saved
  // feedback values pre-fill instead of leaking from the previous demo.
  useEffect(() => {
    if (sel) setSf(fromDemo(sel));
    else setSf(blankSF);
    // depend on selDemo, not sel — sel reference changes on every realtime tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selDemo]);

  // Union of current DB sales_agents + any historical agent strings on demos,
  // so the filter can match both new assignments (by full_name) and seed/legacy rows.
  const agentOptions = useMemo(() => {
    const names = new Set<string>();
    salesAgents.forEach((a) => names.add(a.full_name));
    rangedDemos.forEach((d) => {
      if (d.agent) names.add(d.agent);
    });
    return Array.from(names).sort();
  }, [salesAgents, rangedDemos]);

  const filtered = useMemo(() => {
    let d = rangedDemos.filter((x) => {
      if (fStatus !== "All" && x.status !== fStatus) return false;
      if (fTeacher && x.teacher !== fTeacher) return false;
      if (fAgent && x.agent !== fAgent) return false;
      return true;
    });
    if (sort === "date-desc") d = [...d].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sort === "date-asc") d = [...d].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sort === "rating-desc") d = [...d].sort((a, b) => b.analystRating - a.analystRating);
    if (sort === "age-desc") d = [...d].sort((a, b) => a.ts - b.ts);
    return d;
  }, [rangedDemos, fStatus, fTeacher, fAgent, sort]);

  const hasFilters = fStatus !== "All" || fTeacher || fAgent;
  const allSel = filtered.length > 0 && filtered.every((d) => bulkSel.includes(d.id));
  const toggleAll = () => { if (allSel) setBulkSel([]); else setBulkSel(filtered.map((d) => d.id)); };
  const toggleBulk = (id: number) => setBulkSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const suggestedAcct = useMemo(() => {
    if (!sel) return "";
    if (sel.analystRating <= 2 || sel.pour.length > 0) return "Product";
    if (sel.analystRating >= 4 && sel.studentRaw >= 7) return "Sales";
    return "Consumer";
  }, [sel]);

  const submitSales = () => {
    if (!selDemo || !sel) return;
    // Required-when-Yes validations
    if (sf.feedbackConfused === true && !sf.feedbackConfusedDetail.trim()) {
      flash("Please describe the confusion moments.");
      return;
    }
    if (sf.feedbackUncomfortable === true && !sf.feedbackUncomfortableDetail.trim()) {
      flash("Please describe the uncomfortable moments.");
      return;
    }
    const selectedAgent = salesAgents.find((a) => a.id === sf.salesAgentId);
    const agentName = selectedAgent?.full_name ?? "";
    setConfirm({
      title: "Mark as " + sf.status + "?",
      msg: "Save sales feedback for " + sel.student + ".",
      onConfirm: () => {
        setDemos((p) =>
          p.map((d) =>
            d.id === selDemo
              ? {
                  ...d,
                  status: sf.status,
                  agent: agentName,
                  salesAgentId: sf.salesAgentId || null,
                  link: sf.link,
                  acctType: sf.acctType,
                  marketing: sf.marketing,
                  feedbackRating: sf.feedbackRating,
                  feedbackExplanation: sf.feedbackExplanation,
                  feedbackExplanationComment: sf.feedbackExplanationComment,
                  feedbackParticipation: sf.feedbackParticipation,
                  feedbackParticipationComment: sf.feedbackParticipationComment,
                  feedbackConfused: sf.feedbackConfused,
                  feedbackConfusedDetail: sf.feedbackConfusedDetail,
                  feedbackUncomfortable: sf.feedbackUncomfortable,
                  feedbackUncomfortableDetail: sf.feedbackUncomfortableDetail,
                  feedbackPositiveEnv: sf.feedbackPositiveEnv,
                  feedbackPositiveEnvComment: sf.feedbackPositiveEnvComment,
                  feedbackSuggestions: sf.feedbackSuggestions,
                  feedbackComments: sf.feedbackComments,
                }
              : d
          )
        );
        logActivity(
          sf.status === "Converted" ? "converted" : sf.status === "Not Converted" ? "marked not converted" : "updated",
          agentName || "Sales",
          sel.student
        );
        flash("Sales feedback saved");
        setSelDemo(null);
      },
    });
  };

  const bulkUpdate = (ns: string) => {
    setConfirm({
      title: "Bulk update " + bulkSel.length + " demos?",
      msg: 'Mark as "' + ns + '". Cannot be undone.',
      onConfirm: () => {
        setDemos((p) => p.map((d) => (bulkSel.includes(d.id) ? { ...d, status: ns as "Converted" | "Not Converted" | "Pending" } : d)));
        logActivity("bulk " + ns.toLowerCase(), "Sales", bulkSel.length + " demos");
        flash(bulkSel.length + " demos marked as " + ns);
        setBulkSel([]);
      },
    });
  };

  return (
    <>
      <section style={{ background: "#000", color: "#fff", paddingTop: 92, paddingBottom: 24 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label" style={{ color: MUTED }}>Step 8 + 10</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Sales follow-up.</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {["All", "Pending", "Converted", "Not Converted"].map((f2) => (
              <button key={f2} className="pill" onClick={() => { setFStatus(f2); setSelDemo(null); setBulkSel([]); }} style={{ background: fStatus === f2 ? "rgba(255,255,255,.15)" : "transparent", color: fStatus === f2 ? "#fff" : "rgba(255,255,255,.5)", border: "1px solid " + (fStatus === f2 ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.1)"), fontSize: 12, padding: "5px 14px" }}>{f2}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <SearchableSelect
              variant="dark"
              value={fTeacher}
              onChange={setFTeacher}
              placeholder="All teachers"
              options={TEACHERS.map((t) => ({ value: t.name, label: t.name }))}
            />
            <SearchableSelect
              variant="dark"
              value={fAgent}
              onChange={setFAgent}
              placeholder="All agents"
              options={agentOptions.map((a) => ({ value: a, label: a }))}
            />
            <SearchableSelect
              variant="dark"
              value={sort}
              onChange={setSort}
              placeholder="Sort"
              clearLabel="Default order"
              options={[
                { value: "date-desc",   label: "Newest" },
                { value: "date-asc",    label: "Oldest" },
                { value: "rating-desc", label: "Highest rated" },
                { value: "age-desc",    label: "Longest pending" },
              ]}
            />
            {hasFilters && <button className="pill" onClick={() => { setFStatus("All"); setFTeacher(""); setFAgent(""); }} style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.2)", fontSize: 11, padding: "4px 12px" }}>Clear all</button>}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>{filtered.length} demos{" · "}<button onClick={() => exportCSV(filtered as unknown as Record<string, unknown>[])} style={{ background: "none", border: "none", color: "#2997ff", cursor: "pointer", fontSize: 12 }}>Export filtered CSV</button></div>
        </div>
      </section>

      {bulkSel.length > 0 && (
        <div style={{ background: BLUE, color: "#fff", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, fontSize: 13, fontWeight: 500 }}>
          <span>{bulkSel.length} selected</span>
          <button className="pill" onClick={() => bulkUpdate("Converted")} style={{ background: "#fff", color: BLUE, padding: "5px 14px", fontSize: 12, border: "none" }}>Mark converted</button>
          <button className="pill" onClick={() => bulkUpdate("Not Converted")} style={{ background: "rgba(255,255,255,.2)", color: "#fff", padding: "5px 14px", fontSize: 12, border: "none" }}>Mark not converted</button>
          <button className="pill" onClick={() => setBulkSel([])} style={{ background: "transparent", color: "#fff", padding: "5px 14px", fontSize: 12, border: "1px solid rgba(255,255,255,.4)" }}>Clear</button>
        </div>
      )}

      <section style={{ background: LIGHT_GRAY, padding: "20px 24px 80px", minHeight: 400 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: sel ? "minmax(0,380px) minmax(0,1fr)" : "1fr", gap: 16 }}>
          {/* Queue */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 8px" }}><input type="checkbox" className="apple-checkbox" checked={allSel} onChange={toggleAll} /><span style={{ fontSize: 12, color: MUTED }}>Select all ({filtered.length})</span></div>
            {filtered.length === 0 && <EmptyState text="No demos match filters" />}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map((d) => {
                const age = ageDays(d.ts);
                return (
                  <div key={d.id} className={"demo-card" + (selDemo === d.id ? " selected" : "")} style={{ display: "flex", gap: 10, alignItems: "start" }} onClick={() => setSelDemo(d.id)}>
                    <input type="checkbox" className="apple-checkbox" checked={bulkSel.includes(d.id)} onChange={() => toggleBulk(d.id)} onClick={(e) => e.stopPropagation()} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 6 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{d.student}</div>
                          <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{d.teacher} · {d.level} {d.subject}</div>
                          <div style={{ fontSize: 11, color: MUTED }}>{d.date}{d.status === "Pending" && age > 1 && <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 980, fontSize: 10, fontWeight: 600, background: ageColor(age), color: ageTextColor(age) }}>{age}d</span>}</div>
                        </div>
                        <StatusBadge status={d.status} />
                      </div>
                      {d.pour.length > 0 && <div style={{ marginTop: 4 }}>{d.pour.map((pp) => <span key={pp.cat} className="pour-tag">{pp.cat}</span>)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          {sel && (
            <div className="animate-slide-in" style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", border: "1px solid #e8e8ed" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 22, fontWeight: 600 }}>{sel.student}</h3>
                  <p style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{sel.teacher} (ID: {sel.tid}) · {sel.level} {sel.subject} · {formatMonth(sel.date)}</p>
                </div>
                <button onClick={() => setSelDemo(null)} style={{ background: LIGHT_GRAY, border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
              </div>

              {/* Analyst review summary (read-only) — prefer the QA scorecard
                  when a finalized draft exists; otherwise fall back to the
                  legacy review text for older demos. */}
              {(() => {
                const draft = draftsByDemoId[sel.id];
                if (draft && isFinalized(draft)) {
                  return (
                    <ScorecardSummary
                      draft={draft}
                      recording={sel.recording}
                      studentRaw={sel.studentRaw}
                      reportHref={`/analyst/${sel.id}`}
                    />
                  );
                }
                return (
                  <div style={{ background: LIGHT_GRAY, borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
                    <div className="section-label" style={{ marginBottom: 6 }}>Analyst review</div>
                    {sel.recording && (
                      <p style={{ fontSize: 12, marginBottom: 8 }}>
                        <span style={{ color: MUTED, marginRight: 6 }}>Recording:</span>
                        <a href={sel.recording} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: "none", fontWeight: 500 }}>Open ↗</a>
                      </p>
                    )}
                    <p style={{ fontSize: 13, lineHeight: 1.47 }}>{sel.review || "No review."}</p>
                    {sel.pour.length > 0 && <div style={{ marginTop: 8 }}>{sel.pour.map((pp) => <div key={pp.cat} style={{ marginBottom: 4 }}><span className="pour-tag">{pp.cat}</span>{pp.desc && <span style={{ fontSize: 12, color: MUTED, marginLeft: 6 }}>{pp.desc}</span>}</div>)}</div>}
                    <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                      <span style={{ fontSize: 12, color: MUTED }}>Student: <strong>{Math.round(sel.studentRaw / 2)}/5</strong></span>
                      <span style={{ fontSize: 12, color: MUTED }}>Analyst: <strong>{sel.analystRating}/5</strong></span>
                    </div>
                    {sel.suggestions && <p style={{ fontSize: 12, color: BLUE, marginTop: 6, fontWeight: 500 }}>Suggestion: {sel.suggestions}</p>}
                  </div>
                );
              })()}

              {/* Sales input — status + agent */}
              <div className="section-label" style={{ marginBottom: 10 }}>Sales input</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <Field label="Conversion status">
                  <select className="apple-input apple-select" value={sf.status} onChange={(e) => setSf((p) => ({ ...p, status: e.target.value as SalesForm["status"] }))}>
                    <option>Converted</option><option>Not Converted</option><option>Pending</option>
                  </select>
                </Field>
                <Field label="Sales agent">
                  <select className="apple-input apple-select" value={sf.salesAgentId} onChange={(e) => setSf((p) => ({ ...p, salesAgentId: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {salesAgents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </select>
                </Field>
              </div>

              {/* Q1 — Overall experience 1-10 */}
              <FeedbackQ label="On a scale of 1-10, how would you rate your overall experience during this session?">
                <RatingPills value={sf.feedbackRating} onChange={(v) => setSf((p) => ({ ...p, feedbackRating: v }))} />
              </FeedbackQ>

              {/* Q2 — Topic explanation */}
              <FeedbackQ label="Did the tutor effectively explain the topic or concept during the session?">
                <YesNoToggle value={sf.feedbackExplanation} onChange={(v) => setSf((p) => ({ ...p, feedbackExplanation: v }))} />
                <textarea
                  className="apple-input apple-textarea"
                  placeholder="Optional comment…"
                  style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
                  value={sf.feedbackExplanationComment}
                  onChange={(e) => setSf((p) => ({ ...p, feedbackExplanationComment: e.target.value }))}
                />
              </FeedbackQ>

              {/* Q3 — Active participation */}
              <FeedbackQ label="Were you able to actively participate and ask questions during the session?">
                <YesNoToggle value={sf.feedbackParticipation} onChange={(v) => setSf((p) => ({ ...p, feedbackParticipation: v }))} />
                <textarea
                  className="apple-input apple-textarea"
                  placeholder="Optional comment…"
                  style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
                  value={sf.feedbackParticipationComment}
                  onChange={(e) => setSf((p) => ({ ...p, feedbackParticipationComment: e.target.value }))}
                />
              </FeedbackQ>

              {/* Q4 — Confusion (required if Yes) */}
              <FeedbackQ label="Were there any moments during the session when you felt confused or lost? If yes, please describe.">
                <YesNoToggle value={sf.feedbackConfused} onChange={(v) => setSf((p) => ({ ...p, feedbackConfused: v }))} />
                {sf.feedbackConfused === true && (
                  <textarea
                    className="apple-input apple-textarea"
                    placeholder="Required — describe the confusion…"
                    style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
                    value={sf.feedbackConfusedDetail}
                    onChange={(e) => setSf((p) => ({ ...p, feedbackConfusedDetail: e.target.value }))}
                  />
                )}
              </FeedbackQ>

              {/* Q5 — Uncomfortable (required if Yes) */}
              <FeedbackQ label="Any moments where you felt uncomfortable during the session?">
                <YesNoToggle value={sf.feedbackUncomfortable} onChange={(v) => setSf((p) => ({ ...p, feedbackUncomfortable: v }))} />
                {sf.feedbackUncomfortable === true && (
                  <textarea
                    className="apple-input apple-textarea"
                    placeholder="Required — describe what was uncomfortable…"
                    style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
                    value={sf.feedbackUncomfortableDetail}
                    onChange={(e) => setSf((p) => ({ ...p, feedbackUncomfortableDetail: e.target.value }))}
                  />
                )}
              </FeedbackQ>

              {/* Q6 — Positive environment */}
              <FeedbackQ label="Did the tutor create a positive learning environment?">
                <YesNoToggle value={sf.feedbackPositiveEnv} onChange={(v) => setSf((p) => ({ ...p, feedbackPositiveEnv: v }))} />
                <textarea
                  className="apple-input apple-textarea"
                  placeholder="Optional comment…"
                  style={{ marginTop: 10, fontSize: 13, minHeight: 60 }}
                  value={sf.feedbackPositiveEnvComment}
                  onChange={(e) => setSf((p) => ({ ...p, feedbackPositiveEnvComment: e.target.value }))}
                />
              </FeedbackQ>

              {/* Q7 — Suggestions */}
              <FeedbackQ label="Do you have any suggestions for improvement or specific feedback for the tutor or the platform?">
                <textarea
                  className="apple-input apple-textarea"
                  placeholder="Open-ended…"
                  style={{ fontSize: 13, minHeight: 70 }}
                  value={sf.feedbackSuggestions}
                  onChange={(e) => setSf((p) => ({ ...p, feedbackSuggestions: e.target.value }))}
                />
              </FeedbackQ>

              {/* Q8 — Comments / Others */}
              <FeedbackQ label="Comments / Others">
                <textarea
                  className="apple-input apple-textarea"
                  placeholder="Anything else worth recording…"
                  style={{ fontSize: 13, minHeight: 70 }}
                  value={sf.feedbackComments}
                  onChange={(e) => setSf((p) => ({ ...p, feedbackComments: e.target.value }))}
                />
              </FeedbackQ>

              {/* Reference link + accountability + marketing (kept) */}
              <Field label="Link"><input className="apple-input" placeholder="https://..." value={sf.link} onChange={(e) => setSf((p) => ({ ...p, link: e.target.value }))} /></Field>

              {sf.status === "Not Converted" && (
                <div style={{ background: "#FFF8E1", borderRadius: 12, padding: "14px 18px", marginTop: 8, border: "1px solid #F5D98E" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#8B6914", textTransform: "uppercase", marginBottom: 6 }}>Step 10 — Accountability</div>
                  {suggestedAcct && <p style={{ fontSize: 12, color: "#8B6914", marginBottom: 8 }}>Suggested: <strong>{suggestedAcct}</strong></p>}
                  <select className="apple-input apple-select" value={sf.acctType} onChange={(e) => setSf((p) => ({ ...p, acctType: e.target.value }))}>
                    <option value="">Select type...</option>
                    {ACCT_TYPES.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
                <input type="checkbox" className="apple-checkbox" checked={sf.marketing} onChange={(e) => setSf((p) => ({ ...p, marketing: e.target.checked }))} />
                <span style={{ fontSize: 14 }}>Marketing lead</span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button className="pill pill-blue" style={{ padding: "10px 24px", fontSize: 15 }} onClick={submitSales}>Update demo</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
