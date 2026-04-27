"use client";
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { StatusBadge, EmptyState } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import AccountabilityDrawer from "@/components/accountability-drawer";
import { LEVELS, SUBJECTS, LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK, ACCT_TYPES, acctFinalLabel } from "@/lib/types";
import { teacherFullName } from "@/lib/teacher-transforms";
import { isFinalized } from "@/lib/scorecard";
import { ageDays, exportCSV } from "@/lib/utils";

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

export default function ConductedPage() {
  const { rangedDemos, draftsByDemoId, salesAgents, approvedTeachers, user, confirmDeleteDemo } = useStore();

  // Primary filters (LIGHT_GRAY hero)
  const [fStatus, setFStatus]   = useState("all");
  const [fTeacher, setFTeacher] = useState("");
  const [fLevel, setFLevel]     = useState("");
  const [fSubject, setFSubject] = useState("");
  const [sortBy, setSortBy]     = useState("newest");

  // Secondary filters (collapsible panel)
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [fStage, setFStage] = useState("");
  const [fAge, setFAge] = useState("");
  const [fApproval, setFApproval] = useState("");
  const [fAcct, setFAcct] = useState("");
  const [fFinalised, setFFinalised] = useState(""); // "", "yes", "no"
  const [fRating, setFRating] = useState("");
  const [drawerDemoId, setDrawerDemoId] = useState<number | null>(null);
  const [fAgent, setFAgent] = useState("");
  const [fStudent, setFStudent] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fPour, setFPour] = useState("");
  const [fMarketing, setFMarketing] = useState("");
  const [fRecording, setFRecording] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Agent union — DB sales_agents + historical demo strings
  const agentOptions = useMemo(() => {
    const names = new Set<string>();
    salesAgents.forEach((a) => names.add(a.full_name));
    rangedDemos.forEach((d) => { if (d.agent) names.add(d.agent); });
    return Array.from(names).sort();
  }, [salesAgents, rangedDemos]);

  // Derived option lists — built from live demos
  const students  = useMemo(() => uniqSort(rangedDemos.map((d) => d.student)), [rangedDemos]);
  const grades    = useMemo(() => uniqSort(rangedDemos.map((d) => d.grade)),   [rangedDemos]);
  const pourCats  = useMemo(() => {
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

    let list = rangedDemos.filter((x) => {
      if (fStatus !== "all" && x.status !== fStatus) return false;
      if (fTeacher && x.teacher !== fTeacher) return false;
      if (fLevel   && x.level   !== fLevel)   return false;
      if (fSubject && x.subject !== fSubject) return false;

      if (fAgent   && x.agent         !== fAgent)   return false;
      if (fStage   && x.workflowStage !== fStage)   return false;
      // Account type matches against BOTH the finalised allocation and the
      // sales suggestion — the user is asking "is this demo attributed to X?"
      // not "is X sales' guess?". Finalised takes precedence; if none finalised,
      // fall back to the sales suggestion.
      if (fAcct) {
        const final = x.accountabilityFinal ?? [];
        const hit = final.length > 0 ? final.includes(fAcct) : x.acctType === fAcct;
        if (!hit) return false;
      }
      if (fFinalised === "yes" && !x.accountabilityFinalAt) return false;
      if (fFinalised === "no"  &&  x.accountabilityFinalAt) return false;
      if (fStudent && x.student       !== fStudent) return false;
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

    if (sortBy === "newest")  list = [...list].sort((a, b) => b.ts - a.ts);
    if (sortBy === "oldest")  list = [...list].sort((a, b) => a.ts - b.ts);
    if (sortBy === "rating") {
      list = [...list].sort((a, b) => {
        const sa = draftsByDemoId[a.id];
        const sb = draftsByDemoId[b.id];
        const va = sa && isFinalized(sa) ? sa.draft_data.total_score : a.analystRating * 6.4;
        const vb = sb && isFinalized(sb) ? sb.draft_data.total_score : b.analystRating * 6.4;
        return vb - va;
      });
    }
    if (sortBy === "teacher") list = [...list].sort((a, b) => a.teacher.localeCompare(b.teacher));
    return list;
  }, [
    rangedDemos, draftsByDemoId, sortBy,
    fStatus, fTeacher, fLevel, fSubject,
    search, fStage, fAge, fApproval, fAcct, fFinalised, fRating,
    fAgent, fStudent, fGrade, fPour,
    fMarketing, fRecording, dateFrom, dateTo,
  ]);

  const anyFilter =
    fStatus !== "all" || !!fTeacher || !!fLevel || !!fSubject ||
    !!search || !!fStage || !!fAge || !!fApproval || !!fAcct || !!fFinalised || !!fRating ||
    !!fAgent || !!fStudent || !!fGrade || !!fPour ||
    !!fMarketing || !!fRecording || !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setFStatus("all"); setFTeacher(""); setFLevel(""); setFSubject("");
    setSearch(""); setFStage(""); setFAge(""); setFApproval("");
    setFAcct(""); setFFinalised(""); setFRating(""); setFAgent(""); setFStudent("");
    setFGrade(""); setFPour(""); setFMarketing(""); setFRecording("");
    setDateFrom(""); setDateTo("");
  };

  const acctColor = (acctType: string) => {
    if (acctType === "Sales") return { bg: "#E3F2FD", fg: "#0D47A1" };
    if (acctType === "Product") return { bg: "#FFF8E1", fg: "#8B6914" };
    if (acctType === "Consumer") return { bg: "#E8F5E9", fg: "#1B5E20" };
    return { bg: LIGHT_GRAY, fg: MUTED };
  };

  const headers = ["Date", "Teacher", "Student", "Level", "Subject", "Score", "Status", "Agent", "Accountability", "Report"];

  const SS_BTN = "apple-input";

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Master record</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Conducted demos.</h1>
          <p style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>
            {filtered.length === rangedDemos.length
              ? `${filtered.length} demo${filtered.length !== 1 ? "s" : ""} in range.`
              : `${filtered.length} of ${rangedDemos.length} demos in range.`}
          </p>
        </div>

        <div style={{ maxWidth: 1200, margin: "20px auto 0", padding: "0 24px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {/* Status pills */}
          {(["all", "Pending", "Converted", "Not Converted"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFStatus(s)}
              className="pill"
              style={{
                padding: "6px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: fStatus === s ? NEAR_BLACK : "#fff",
                color: fStatus === s ? "#fff" : MUTED,
                border: fStatus === s ? "1px solid " + NEAR_BLACK : "1px solid #e8e8ed",
              }}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}

          <SearchableSelect
            variant="light"
            value={fTeacher}
            onChange={setFTeacher}
            placeholder="Teacher"
            clearLabel="All teachers"
            options={Array.from(new Set(approvedTeachers.map(teacherFullName))).map((n) => ({ value: n, label: n }))}
          />
          <SearchableSelect
            variant="light"
            value={fLevel}
            onChange={setFLevel}
            placeholder="Level"
            clearLabel="All levels"
            options={LEVELS.map((l) => ({ value: l, label: l }))}
          />
          <SearchableSelect
            variant="light"
            value={fSubject}
            onChange={setFSubject}
            placeholder="Subject"
            clearLabel="All subjects"
            options={SUBJECTS.map((s) => ({ value: s, label: s }))}
          />
          <SearchableSelect
            variant="light"
            value={sortBy}
            onChange={setSortBy}
            placeholder="Sort"
            clearLabel="Newest first"
            options={[
              { value: "newest",  label: "Newest" },
              { value: "oldest",  label: "Oldest" },
              { value: "rating",  label: "Highest rated" },
              { value: "teacher", label: "Teacher A-Z" },
            ]}
          />

          {anyFilter && (
            <button
              onClick={clearFilters}
              className="pill"
              style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#fff", color: "#c13030", border: "1px solid #f5c6c6" }}
            >
              Clear all
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: MUTED }}>{filtered.length} demos</span>
            <button
              onClick={() => exportCSV(filtered as unknown as Record<string, unknown>[])}
              className="pill"
              style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: BLUE, color: "#fff", border: "none" }}
            >
              Export CSV
            </button>
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "32px 24px 80px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* ── secondary-filter toolbar ──────────────────────────────── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: showFilters ? 12 : 16, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="conducted-filter-panel"
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
              {anyFilter && (
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
              id="conducted-filter-panel"
              className="animate-fade-up"
              style={{
                marginBottom: 24, padding: 16, background: LIGHT_GRAY, borderRadius: 14,
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
                <label style={LABEL}>Finalised</label>
                <SearchableSelect
                  options={[
                    { value: "yes", label: "Finalised" },
                    { value: "no",  label: "Awaiting" },
                  ]}
                  value={fFinalised}
                  onChange={setFFinalised}
                  placeholder="Any"
                  clearLabel="Any"
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
                <label style={LABEL}>Agent</label>
                <SearchableSelect
                  options={toOpts(agentOptions)}
                  value={fAgent}
                  onChange={setFAgent}
                  placeholder="All agents"
                  clearLabel="All agents"
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

              {anyFilter && (
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

          {/* ── table ─────────────────────────────────────────────────── */}
          <div style={{ overflowX: "auto" }}>
            {filtered.length === 0 ? (
              <EmptyState text="No conducted demos match the current filters" />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h} style={{
                        textAlign: "left", padding: "8px 12px",
                        borderBottom: "1px solid #e8e8ed",
                        color: MUTED, fontSize: 10, fontWeight: 600,
                        textTransform: "uppercase", whiteSpace: "nowrap",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const draft = draftsByDemoId[d.id];
                    const hasDraft = draft && isFinalized(draft);
                    const scoreDisplay = hasDraft
                      ? `${draft.draft_data.total_score}/32`
                      : d.analystRating > 0 ? `${d.analystRating}/5` : "—";
                    const final = d.accountabilityFinal ?? [];
                    const isFinalised = !!d.accountabilityFinalAt;
                    const clickable = d.status === "Not Converted";
                    return (
                      <tr
                        key={d.id}
                        style={{
                          borderBottom: "1px solid #f5f5f7",
                          cursor: clickable ? "pointer" : "default",
                        }}
                        onClick={clickable ? () => setDrawerDemoId(d.id) : undefined}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td style={{ padding: "9px 12px", color: MUTED, whiteSpace: "nowrap" }}>{d.date}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 500, color: NEAR_BLACK }}>{d.teacher}</td>
                        <td style={{ padding: "9px 12px" }}>{d.student}</td>
                        <td style={{ padding: "9px 12px", color: MUTED }}>{d.level}</td>
                        <td style={{ padding: "9px 12px", color: MUTED }}>{d.subject}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 600, color: NEAR_BLACK }}>{scoreDisplay}</td>
                        <td style={{ padding: "9px 12px" }}><StatusBadge status={d.status} /></td>
                        <td style={{ padding: "9px 12px", color: MUTED }}>{d.agent || "—"}</td>
                        <td style={{ padding: "9px 12px" }}>
                          {d.status !== "Not Converted" ? (
                            <span style={{ color: MUTED }}>—</span>
                          ) : isFinalised && final.length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {final.map((v) => {
                                const ac = acctColor(v);
                                return (
                                  <span
                                    key={v}
                                    style={{
                                      padding: "3px 10px", borderRadius: 980, fontSize: 11, fontWeight: 600,
                                      background: ac.bg, color: ac.fg,
                                    }}
                                  >
                                    {acctFinalLabel(v)}
                                  </span>
                                );
                              })}
                            </div>
                          ) : d.acctType ? (
                            <span
                              title="Sales suggestion — awaiting analyst finalisation"
                              style={{
                                padding: "3px 10px", borderRadius: 980, fontSize: 11, fontWeight: 500,
                                background: LIGHT_GRAY, color: MUTED, fontStyle: "italic",
                              }}
                            >
                              Sales: {d.acctType}
                            </span>
                          ) : (
                            <span style={{ color: MUTED, fontSize: 11 }}>Awaiting</span>
                          )}
                        </td>
                        <td style={{ padding: "9px 12px" }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Link href={`/analyst/${d.id}`} style={{ color: BLUE, textDecoration: "none", fontWeight: 500 }}>
                              View →
                            </Link>
                            {user?.role === "manager" && (
                              <button
                                type="button"
                                onClick={() => confirmDeleteDemo(d)}
                                className="pill pill-outline"
                                style={{ fontSize: 11, padding: "3px 10px", color: "#B42318", borderColor: "#FDA29B" }}
                                title="Delete demo"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <AccountabilityDrawer demoId={drawerDemoId} onClose={() => setDrawerDemoId(null)} />
    </>
  );
}
