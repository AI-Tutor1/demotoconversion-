"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { StatusBadge, EmptyState } from "@/components/ui";
import { ScorecardSummary } from "@/components/scorecard-summary";
import { SearchableSelect } from "@/components/searchable-select";
import { MUTED, BLUE, LIGHT_GRAY, ACCT_TYPES } from "@/lib/types";
import { teacherFullName } from "@/lib/teacher-transforms";
import { ageDays, ageColor, ageTextColor, formatMonth, exportCSV } from "@/lib/utils";
import { isFinalized } from "@/lib/scorecard";

// ─── Static filter option sets ────────────────────────────────────────

const WORKFLOW_STAGES: { value: string; label: string }[] = [
  { value: "new",           label: "New" },
  { value: "assigned",      label: "Assigned" },
  { value: "under_review",  label: "Under review" },
  { value: "pending_sales", label: "Pending sales" },
  { value: "contacted",     label: "Contacted" },
  { value: "converted",     label: "Converted" },
  { value: "lost",          label: "Lost" },
];

const AGE_BUCKETS: { value: string; label: string }[] = [
  { value: "lt3",   label: "< 3 days" },
  { value: "3to7",  label: "3 – 7 days" },
  { value: "7to14", label: "7 – 14 days" },
  { value: "gt14",  label: "14+ days" },
];

const APPROVAL_OPTS: { value: string; label: string }[] = [
  { value: "approved", label: "Analyst Approved" },
  { value: "waiting",  label: "Waiting for Analyst" },
];

const YESNO: { value: string; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no",  label: "No" },
];

const RATING_OPTS: { value: string; label: string }[] =
  [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `≥ ${n} ★` }));

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

// ─── Page ─────────────────────────────────────────────────────────

export default function SalesPage() {
  const { rangedDemos, setDemos, flash, setConfirm, logActivity, salesAgents, draftsByDemoId, approvedTeachers } = useStore();
  const [selDemo, setSelDemo] = useState<number | null>(null);
  const [bulkSel, setBulkSel] = useState<number[]>([]);

  // Primary filters (dark header)
  const [fStatus, setFStatus] = useState("All");
  const [fTeacher, setFTeacher] = useState("");
  const [fAgent, setFAgent] = useState("");
  const [sort, setSort] = useState("date-desc");

  // Secondary filters (collapsible panel)
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [fStage, setFStage] = useState("");
  const [fAge, setFAge] = useState("");
  const [fApproval, setFApproval] = useState("");
  const [fAcct, setFAcct] = useState("");
  const [fRating, setFRating] = useState("");
  const [fStudent, setFStudent] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [fLevel, setFLevel] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fPour, setFPour] = useState("");
  const [fMarketing, setFMarketing] = useState("");
  const [fRecording, setFRecording] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  // Derived option lists — built from live demos so empty values never appear
  const students = useMemo(() => uniqSort(rangedDemos.map((d) => d.student)), [rangedDemos]);
  const subjects = useMemo(() => uniqSort(rangedDemos.map((d) => d.subject)), [rangedDemos]);
  const levels   = useMemo(() => uniqSort(rangedDemos.map((d) => d.level)),   [rangedDemos]);
  const grades   = useMemo(() => uniqSort(rangedDemos.map((d) => d.grade)),   [rangedDemos]);
  const pourCats = useMemo(() => {
    const s = new Set<string>();
    rangedDemos.forEach((d) => d.pour.forEach((p) => { if (p.cat) s.add(p.cat); }));
    return Array.from(s).sort();
  }, [rangedDemos]);
  const acctTypes = useMemo(
    () => uniqSort([...ACCT_TYPES, ...rangedDemos.map((d) => d.acctType)]),
    [rangedDemos],
  );

  const filtered = useMemo(() => {
    const q    = search.toLowerCase().trim();
    const from = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const to   = dateTo   ? new Date(dateTo   + "T23:59:59").getTime() : null;

    let d = rangedDemos.filter((x) => {
      if (fStatus !== "All" && x.status !== fStatus) return false;
      if (fTeacher && x.teacher !== fTeacher) return false;
      if (fAgent   && x.agent   !== fAgent)   return false;

      if (fStage   && x.workflowStage !== fStage)   return false;
      if (fAcct    && x.acctType      !== fAcct)    return false;
      if (fStudent && x.student       !== fStudent) return false;
      if (fSubject && x.subject       !== fSubject) return false;
      if (fLevel   && x.level         !== fLevel)   return false;
      if (fGrade   && x.grade         !== fGrade)   return false;

      if (fPour && !x.pour.some((p) => p.cat === fPour)) return false;

      if (fRating) {
        const min = Number(fRating);
        if (!Number.isFinite(min) || x.analystRating < min) return false;
      }

      if (fAge) {
        const a = ageDays(x.ts);
        if (fAge === "lt3"   && !(a < 3))            return false;
        if (fAge === "3to7"  && !(a >= 3 && a < 7))  return false;
        if (fAge === "7to14" && !(a >= 7 && a < 14)) return false;
        if (fAge === "gt14"  && !(a >= 14))          return false;
      }

      if (fApproval) {
        const draft = draftsByDemoId[x.id];
        const approved = !!(draft && isFinalized(draft));
        if (fApproval === "approved" && !approved) return false;
        if (fApproval === "waiting"  && approved)  return false;
      }

      if (fMarketing === "yes" && !x.marketing) return false;
      if (fMarketing === "no"  &&  x.marketing) return false;

      if (fRecording === "yes" && !x.recording) return false;
      if (fRecording === "no"  &&  x.recording) return false;

      if (from !== null || to !== null) {
        if (!x.date) return false;
        const t = new Date(x.date + "T00:00:00").getTime();
        if (from !== null && t < from) return false;
        if (to   !== null && t > to)   return false;
      }

      if (q) {
        const hay = [x.student, x.teacher, x.subject, x.agent, x.suggestions, x.level, x.grade]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    if (sort === "date-desc")   d = [...d].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sort === "date-asc")    d = [...d].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sort === "rating-desc") d = [...d].sort((a, b) => b.analystRating - a.analystRating);
    if (sort === "age-desc")    d = [...d].sort((a, b) => a.ts - b.ts);
    return d;
  }, [
    rangedDemos, draftsByDemoId, sort,
    fStatus, fTeacher, fAgent,
    search, fStage, fAge, fApproval, fAcct, fRating,
    fStudent, fSubject, fLevel, fGrade, fPour,
    fMarketing, fRecording, dateFrom, dateTo,
  ]);

  const hasFilters =
    fStatus !== "All" || !!fTeacher || !!fAgent ||
    !!search || !!fStage || !!fAge || !!fApproval || !!fAcct || !!fRating ||
    !!fStudent || !!fSubject || !!fLevel || !!fGrade || !!fPour ||
    !!fMarketing || !!fRecording || !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setFStatus("All"); setFTeacher(""); setFAgent("");
    setSearch(""); setFStage(""); setFAge(""); setFApproval("");
    setFAcct(""); setFRating(""); setFStudent(""); setFSubject("");
    setFLevel(""); setFGrade(""); setFPour("");
    setFMarketing(""); setFRecording(""); setDateFrom(""); setDateTo("");
  };

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

  const SS_BTN = "apple-input";

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
              options={Array.from(new Set(approvedTeachers.map(teacherFullName))).map((n) => ({ value: n, label: n }))}
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
            {hasFilters && <button className="pill" onClick={clearFilters} style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.2)", fontSize: 11, padding: "4px 12px" }}>Clear all</button>}
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
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* ── secondary-filter toolbar ──────────────────────────────── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: showFilters ? 12 : 16, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="sales-filter-panel"
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
              placeholder="Search student, teacher, subject, agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 320, fontSize: 14 }}
            />

            <span style={{ color: MUTED, fontSize: 13, marginLeft: "auto" }}>
              {filtered.length} demo{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── collapsible filter panel ─────────────────────────────── */}
          {showFilters && (
            <div
              id="sales-filter-panel"
              className="animate-fade-up"
              style={{
                marginBottom: 24, padding: 16, background: "#fff", borderRadius: 14,
                border: "1px solid #e8e8ed",
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 12, alignItems: "end",
              }}
            >
              <div style={FIELD}>
                <label style={LABEL}>Workflow stage</label>
                <SearchableSelect
                  options={WORKFLOW_STAGES}
                  value={fStage}
                  onChange={setFStage}
                  placeholder="All stages"
                  clearLabel="All stages"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Age</label>
                <SearchableSelect
                  options={AGE_BUCKETS}
                  value={fAge}
                  onChange={setFAge}
                  placeholder="Any age"
                  clearLabel="Any age"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Analyst approval</label>
                <SearchableSelect
                  options={APPROVAL_OPTS}
                  value={fApproval}
                  onChange={setFApproval}
                  placeholder="Any approval"
                  clearLabel="Any approval"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Account type</label>
                <SearchableSelect
                  options={toOpts(acctTypes)}
                  value={fAcct}
                  onChange={setFAcct}
                  placeholder="All account types"
                  clearLabel="All account types"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Min analyst rating</label>
                <SearchableSelect
                  options={RATING_OPTS}
                  value={fRating}
                  onChange={setFRating}
                  placeholder="Any rating"
                  clearLabel="Any rating"
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
                <label style={LABEL}>Level</label>
                <SearchableSelect
                  options={toOpts(levels)}
                  value={fLevel}
                  onChange={setFLevel}
                  placeholder="All levels"
                  clearLabel="All levels"
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
                <label style={LABEL}>POUR category</label>
                <SearchableSelect
                  options={toOpts(pourCats)}
                  value={fPour}
                  onChange={setFPour}
                  placeholder="Any POUR"
                  clearLabel="Any POUR"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Marketing lead</label>
                <SearchableSelect
                  options={YESNO}
                  value={fMarketing}
                  onChange={setFMarketing}
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

          {/* ── queue + detail ────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: sel ? "minmax(0,380px) minmax(0,1fr)" : "1fr", gap: 16 }}>
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
        </div>
      </section>
    </>
  );
}
