"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { StatusBadge, EmptyState } from "@/components/ui";
import { ScorecardSummary } from "@/components/scorecard-summary";
import { SearchableSelect } from "@/components/searchable-select";
import { TEACHERS, MUTED, BLUE, LIGHT_GRAY } from "@/lib/types";
import { ageDays, ageColor, ageTextColor, formatMonth, exportCSV } from "@/lib/utils";
import { isFinalized } from "@/lib/scorecard";

// ─── Page ─────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { rangedDemos, setDemos, flash, setConfirm, logActivity, salesAgents, draftsByDemoId } = useStore();
  const [selDemo, setSelDemo] = useState<number | null>(null);
  const [bulkSel, setBulkSel] = useState<number[]>([]);
  const [fStatus, setFStatus] = useState("All");
  const [fTeacher, setFTeacher] = useState("");
  const [fAgent, setFAgent] = useState("");
  const [sort, setSort] = useState("date-desc");

  const sel = rangedDemos.find((d) => d.id === selDemo);

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

  const bulkUpdate = (ns: string) => {
    setConfirm({
      title: "Bulk update " + bulkSel.length + " demos?",
      msg: 'Mark as "' + ns + '". Cannot be undone.',
      onConfirm: () => {
        setDemos((p) => p.map((d) => (bulkSel.includes(d.id) ? { ...d, status: ns as "Converted" | "Not Converted" | "Pending" } : d)));
        logActivity("bulk " + ns.toLowerCase(), bulkSel.length + " demos");
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
              options={Array.from(new Set(TEACHERS.map((t) => t.name))).map((n) => ({ value: n, label: n }))}
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
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <StatusBadge status={d.status} />
                          {(() => {
                            const draft = draftsByDemoId[d.id];
                            const approved = draft && isFinalized(draft);
                            return (
                              <span style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: 980,
                                background: approved ? "#E8F5E9" : "#FFF8E1",
                                color: approved ? "#1B5E20" : "#8B6914",
                              }}>
                                {approved ? "Analyst Approved" : "Waiting for Analyst"}
                              </span>
                            );
                          })()}
                        </div>
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
                if (draft && draft.status !== "rejected") {
                  return (
                    <>
                      {draft.status === "pending_review" && (
                        <p style={{ fontSize: 11, color: MUTED, fontStyle: "italic", marginBottom: 8 }}>
                          AI draft — pending analyst approval
                        </p>
                      )}
                      <ScorecardSummary
                        draft={draft}
                        recording={sel.recording}
                        studentRaw={sel.studentRaw}
                        reportHref={`/analyst/${sel.id}`}
                      />
                    </>
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

              {/* Sales input — redirected to review page */}
              <div style={{ marginTop: 16 }}>
                <Link
                  href={`/analyst/${sel.id}`}
                  className="pill pill-blue"
                  style={{ padding: "10px 24px", fontSize: 15, display: "inline-block" }}
                >
                  {sel.status === "Pending" ? "Complete sales input →" : "View report →"}
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
