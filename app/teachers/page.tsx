"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { Stars, StatusBadge, EmptyState } from "@/components/ui";
import { TeacherScorecard } from "@/components/teacher-scorecard";
import { TeacherProductLog } from "@/components/teacher-product-log";
import { SearchableSelect } from "@/components/searchable-select";
import { LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK, ACCT_TYPES, ACCT_FINAL_CATEGORIES, acctFinalLabel } from "@/lib/types";
import { teacherFullName } from "@/lib/teacher-transforms";
import type { TeacherSession } from "@/lib/types";
import { initials } from "@/lib/utils";
import { isFinalized } from "@/lib/scorecard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type TabKey = "dashboard" | "product" | "demos" | "reviews";

// ─── Static filter option sets ──────────────────────────────────────

const MIN_DEMOS_OPTS: { value: string; label: string }[] = [
  { value: "1",  label: "≥ 1 demo" },
  { value: "5",  label: "≥ 5 demos" },
  { value: "10", label: "≥ 10 demos" },
  { value: "25", label: "≥ 25 demos" },
];

const CONVERSION_BUCKETS: { value: string; label: string }[] = [
  { value: "zero", label: "0%" },
  { value: "low",  label: "1 – 49%" },
  { value: "mid",  label: "50 – 74%" },
  { value: "high", label: "75 – 100%" },
];

const RATING_OPTS: { value: string; label: string }[] =
  [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `≥ ${n} ★` }));

const DEMO_STATUS_OPTS: { value: string; label: string }[] = [
  { value: "Pending",       label: "Pending" },
  { value: "Converted",     label: "Converted" },
  { value: "Not Converted", label: "Not Converted" },
];

const PROC_STATUS_OPTS: { value: string; label: string }[] = [
  { value: "pending",    label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "scored",     label: "Scored" },
  { value: "approved",   label: "Approved" },
  { value: "failed",     label: "Failed" },
];

const YESNO: { value: string; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no",  label: "No" },
];

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

export default function TeachersPage() {
  const { rangedDemos: demos, draftsByDemoId, user, sessionTeachers, teacherSessions, approvedTeachers } = useStore();
  const [sortBy, setSortBy] = useState("rate-desc");
  const [drill, setDrill] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const canSeeProductLog = user?.role === "analyst" || user?.role === "manager";

  // ── outer grid filter state (collapsible panel) ──────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [fMinDemos, setFMinDemos] = useState("");
  const [fConv, setFConv] = useState("");
  const [fRating, setFRating] = useState("");
  const [fHasPour, setFHasPour] = useState("");
  const [fPourCat, setFPourCat] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [fLevel, setFLevel] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fAcct, setFAcct] = useState("");
  const [fProductLog, setFProductLog] = useState("");
  const [fHasDemos, setFHasDemos] = useState("");
  const [fDemoStatus, setFDemoStatus] = useState("");
  const [fMarketing, setFMarketing] = useState("");
  const [fTid, setFTid] = useState("");

  // ── drill-panel filter state — applies to all 4 tabs ─────────────
  const [showDrillFilters, setShowDrillFilters] = useState(false);
  const [dSearch, setDSearch] = useState("");
  const [dSubject, setDSubject] = useState("");
  const [dGrade, setDGrade] = useState("");
  const [dDemoStatus, setDDemoStatus] = useState("");
  const [dProcStatus, setDProcStatus] = useState("");
  const [dPourCat, setDPourCat] = useState("");
  const [dMinRating, setDMinRating] = useState("");
  const [dRecording, setDRecording] = useState("");
  const [dDateFrom, setDDateFrom] = useState("");
  const [dDateTo, setDDateTo] = useState("");

  const tStats = useMemo(() => {
    // Key by tid (uid) so two teachers who share a name but have different
    // tids (e.g. both named "Muhammad Ebraheem" at uid 768 and 396) are kept
    // as separate entries rather than being merged into one smeared card.
    const m: Record<string, { name: string; tid: number; total: number; conv: number; ratings: number[]; pours: number; pourCats: Record<string, number>; demos: typeof demos }> = {};
    demos.forEach((d) => {
      const key = String(d.tid);
      if (!m[key]) m[key] = { name: d.teacher, tid: d.tid, total: 0, conv: 0, ratings: [], pours: 0, pourCats: {}, demos: [] };
      const t = m[key]; t.total++;
      if (d.status === "Converted") t.conv++; t.ratings.push(d.analystRating);
      if (d.pour.length > 0) t.pours++; d.pour.forEach((p) => { t.pourCats[p.cat] = (t.pourCats[p.cat] || 0) + 1; });
      t.demos.push(d);
    });

    // Surface all teachers who have any session (not just approved) so their
    // profile card is reachable. The Product log tab inside still shows only
    // approved sessions — this only controls card visibility.
    if (canSeeProductLog) {
      // Join on approved teacher names (includes everyone backfilled from the
      // legacy TEACHERS roster plus new HR-approved tutors). Two tutors can
      // share a name, so we fall back to matching the first one we find —
      // acceptable given cards are navigable to /teachers/[id].
      const nameToTid = new Map(
        approvedTeachers
          .filter((t) => t.tid != null)
          .map((t) => [teacherFullName(t).toLowerCase(), t.tid as number])
      );
      sessionTeachers.forEach((st) => {
        const nm = st.teacherUserName.trim();
        if (!nm) return;
        const tid = nameToTid.get(nm.toLowerCase());
        if (!tid) return;
        const key = String(tid);
        if (!m[key]) m[key] = { name: nm, tid, total: 0, conv: 0, ratings: [], pours: 0, pourCats: {}, demos: [] };
      });
    }

    let arr = Object.entries(m).map(([, s]) => ({ ...s, avg: s.ratings.length ? (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1) : "0", rate: s.total ? Math.round((s.conv / s.total) * 100) : 0 }));
    if (sortBy === "rate-desc") arr.sort((a, b) => b.rate - a.rate);
    if (sortBy === "rate-asc") arr.sort((a, b) => a.rate - b.rate);
    if (sortBy === "rating-desc") arr.sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));
    if (sortBy === "volume-desc") arr.sort((a, b) => b.total - a.total);
    if (sortBy === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [demos, sortBy, sessionTeachers, canSeeProductLog, approvedTeachers]);

  // ── derived option lists for OUTER grid filters ────────────────
  const subjects = useMemo(() => uniqSort(demos.map((d) => d.subject)), [demos]);
  const levels   = useMemo(() => uniqSort(demos.map((d) => d.level)),   [demos]);
  const grades   = useMemo(() => uniqSort(demos.map((d) => d.grade)),   [demos]);
  const pourCats = useMemo(() => {
    const s = new Set<string>();
    demos.forEach((d) => d.pour.forEach((p) => { if (p.cat) s.add(p.cat); }));
    return Array.from(s).sort();
  }, [demos]);
  const acctTypes = useMemo(
    () => uniqSort([...ACCT_TYPES, ...demos.map((d) => d.acctType)]),
    [demos],
  );

  // Stable-FK lookup for "Has product log" — matches by teacher_user_id,
  // not by name. See memory/feedback_join_by_stable_fk.md (2026-04-19).
  const productLogTids = useMemo(() => {
    const set = new Set<string>();
    sessionTeachers.forEach((st) => {
      if (st.teacherUserId) set.add(st.teacherUserId);
    });
    return set;
  }, [sessionTeachers]);

  // ── outer-grid filtered teacher list ────────────────
  const filteredStats = useMemo(() => {
    const q   = search.toLowerCase().trim();
    const tid = fTid.toLowerCase().trim();
    const minDemos = fMinDemos ? Number(fMinDemos) : 0;
    const minRate  = fRating   ? Number(fRating)   : 0;

    return tStats.filter((s) => {
      if (minDemos && s.total < minDemos) return false;
      if (minRate  && parseFloat(s.avg) < minRate) return false;

      if (fConv) {
        if (fConv === "zero" && s.rate !== 0) return false;
        if (fConv === "low"  && !(s.rate >= 1  && s.rate < 50))  return false;
        if (fConv === "mid"  && !(s.rate >= 50 && s.rate < 75))  return false;
        if (fConv === "high" && !(s.rate >= 75))                 return false;
      }

      if (fHasPour === "yes" && !(s.pours > 0)) return false;
      if (fHasPour === "no"  && !(s.pours === 0)) return false;

      if (fPourCat && !(s.pourCats[fPourCat] > 0)) return false;

      if (fSubject && !s.demos.some((d) => d.subject === fSubject)) return false;
      if (fLevel   && !s.demos.some((d) => d.level   === fLevel))   return false;
      if (fGrade   && !s.demos.some((d) => d.grade   === fGrade))   return false;

      if (fAcct && !s.demos.some((d) => d.status === "Not Converted" && d.acctType === fAcct)) return false;

      if (fProductLog === "yes" && !productLogTids.has(String(s.tid))) return false;
      if (fProductLog === "no"  &&  productLogTids.has(String(s.tid))) return false;

      if (fHasDemos === "yes" && !(s.total > 0))  return false;
      if (fHasDemos === "no"  && !(s.total === 0)) return false;

      if (fDemoStatus && !s.demos.some((d) => d.status === fDemoStatus)) return false;

      if (fMarketing === "yes" && !s.demos.some((d) => d.marketing)) return false;
      if (fMarketing === "no"  &&  s.demos.some((d) => d.marketing)) return false;

      if (tid && !String(s.tid).includes(tid)) return false;

      if (q) {
        const hay = [s.name, String(s.tid), ...s.demos.map((d) => d.student)]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    tStats, productLogTids,
    search, fTid, fMinDemos, fConv, fRating,
    fHasPour, fPourCat, fSubject, fLevel, fGrade,
    fAcct, fProductLog, fHasDemos, fDemoStatus, fMarketing,
  ]);

  const hasFilters =
    !!search || !!fMinDemos || !!fConv || !!fRating ||
    !!fHasPour || !!fPourCat || !!fSubject || !!fLevel || !!fGrade ||
    !!fAcct || !!fProductLog || !!fHasDemos || !!fDemoStatus ||
    !!fMarketing || !!fTid;

  const clearFilters = () => {
    setSearch(""); setFMinDemos(""); setFConv(""); setFRating("");
    setFHasPour(""); setFPourCat(""); setFSubject(""); setFLevel("");
    setFGrade(""); setFAcct(""); setFProductLog(""); setFHasDemos("");
    setFDemoStatus(""); setFMarketing(""); setFTid("");
  };

  // drill holds the tid string (unique per teacher) rather than the name.
  const drillData = drill ? tStats.find((t) => String(t.tid) === drill) : null;

  // Reset drill-panel filters whenever the drilled teacher changes, so one
  // teacher's filter state doesn't leak into the next teacher's view.
  useEffect(() => {
    setDSearch(""); setDSubject(""); setDGrade(""); setDDemoStatus("");
    setDProcStatus(""); setDPourCat(""); setDMinRating(""); setDRecording("");
    setDDateFrom(""); setDDateTo(""); setShowDrillFilters(false);
  }, [drill]);

  // Drill-panel filter-option lists — union of this teacher's demo-side
  // values + their session-side values (matched by stable FK). Ensures
  // subjects/grades a teacher only teaches via sessions still appear.
  const drillSessionsForTeacher = useMemo<TeacherSession[]>(() => {
    if (!drillData) return [];
    const tidStr = String(drillData.tid);
    return teacherSessions.filter((s) => s.teacherUserId === tidStr);
  }, [drillData, teacherSessions]);

  const dSubjectOpts = useMemo(() => {
    if (!drillData) return [];
    const s = new Set<string>();
    drillData.demos.forEach((d) => { if (d.subject) s.add(d.subject); });
    drillSessionsForTeacher.forEach((st) => { if (st.subject) s.add(st.subject); });
    return Array.from(s).sort();
  }, [drillData, drillSessionsForTeacher]);

  const dGradeOpts = useMemo(() => {
    if (!drillData) return [];
    const s = new Set<string>();
    drillData.demos.forEach((d) => { if (d.grade) s.add(d.grade); });
    drillSessionsForTeacher.forEach((st) => { if (st.grade) s.add(st.grade); });
    return Array.from(s).sort();
  }, [drillData, drillSessionsForTeacher]);

  const dPourOpts = useMemo(() => {
    if (!drillData) return [];
    const s = new Set<string>();
    drillData.demos.forEach((d) => d.pour.forEach((p) => { if (p.cat) s.add(p.cat); }));
    drillSessionsForTeacher.forEach((st) => st.pourIssues.forEach((p) => { if (p.category) s.add(p.category); }));
    return Array.from(s).sort();
  }, [drillData, drillSessionsForTeacher]);

  // Filtered demos — drives Dashboard, Demo logs, Reviews tabs.
  const filteredDemos = useMemo(() => {
    if (!drillData) return [];
    const q = dSearch.toLowerCase().trim();
    const from = dDateFrom ? new Date(dDateFrom + "T00:00:00").getTime() : null;
    const to   = dDateTo   ? new Date(dDateTo   + "T23:59:59").getTime() : null;
    const minR = dMinRating ? Number(dMinRating) : 0;

    return drillData.demos.filter((d) => {
      if (dSubject && d.subject !== dSubject) return false;
      if (dGrade   && d.grade   !== dGrade)   return false;
      if (dDemoStatus && d.status !== dDemoStatus) return false;
      if (dPourCat && !d.pour.some((p) => p.cat === dPourCat)) return false;
      if (dRecording === "yes" && !d.recording) return false;
      if (dRecording === "no"  &&  d.recording) return false;
      if (minR && d.analystRating < minR) return false;

      if (from !== null || to !== null) {
        if (!d.date) return false;
        const t = new Date(d.date + "T00:00:00").getTime();
        if (from !== null && t < from) return false;
        if (to   !== null && t > to)   return false;
      }

      if (q) {
        const hay = [d.student, d.subject, d.level, d.review, d.verbatim, d.comments]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // dProcStatus is a sessions-only filter — no-op on demos
      return true;
    });
  }, [
    drillData,
    dSearch, dSubject, dGrade, dDemoStatus, dPourCat,
    dMinRating, dRecording, dDateFrom, dDateTo,
  ]);

  // Recomputed header + KPI stats from the filtered demo slice — keeps
  // the numbers in the drill header consistent with the currently visible
  // rows. Falls back to drillData when no filters are applied.
  const drillStats = useMemo(() => {
    if (!drillData) return null;
    const total = filteredDemos.length;
    const conv  = filteredDemos.filter((d) => d.status === "Converted").length;
    const ratings = filteredDemos.map((d) => d.analystRating);
    const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "0";
    const rate = total ? Math.round((conv / total) * 100) : 0;
    const pours = filteredDemos.filter((d) => d.pour.length > 0).length;
    const pourCats: Record<string, number> = {};
    filteredDemos.forEach((d) => d.pour.forEach((p) => { pourCats[p.cat] = (pourCats[p.cat] || 0) + 1; }));
    // Accountability breakdown — counts finalised allocations per category.
    // A demo with [Product, Sales] contributes 1 to each bucket.
    const acctFinalCounts: Record<string, number> = { Product: 0, Sales: 0, Consumer: 0 };
    let finalisedCount = 0;
    filteredDemos.forEach((d) => {
      if (!d.accountabilityFinalAt) return;
      finalisedCount++;
      d.accountabilityFinal.forEach((c) => {
        if (acctFinalCounts[c] !== undefined) acctFinalCounts[c]++;
      });
    });
    const awaitingCount = filteredDemos.filter(
      (d) => d.status === "Not Converted" && !d.accountabilityFinalAt
    ).length;
    return { total, conv, rate, avg, pours, pourCats, acctFinalCounts, finalisedCount, awaitingCount };
  }, [drillData, filteredDemos]);

  // Session-side predicate — flows the drill filters into the Product log
  // tab via TeacherProductLog.filterFn. Demo-only fields (dDemoStatus,
  // dMinRating) are no-ops here. useCallback so the child's useMemo sees
  // a stable reference when unrelated state changes.
  const sessionFilterFn = useCallback((s: TeacherSession) => {
    const q = dSearch.toLowerCase().trim();
    const from = dDateFrom ? new Date(dDateFrom + "T00:00:00").getTime() : null;
    const to   = dDateTo   ? new Date(dDateTo   + "T23:59:59").getTime() : null;

    if (dSubject && s.subject !== dSubject) return false;
    if (dGrade   && s.grade   !== dGrade)   return false;
    if (dProcStatus && s.processingStatus !== dProcStatus) return false;
    if (dPourCat && !s.pourIssues.some((p) => p.category === dPourCat)) return false;
    if (dRecording === "yes" && !s.recordingLink) return false;
    if (dRecording === "no"  &&  s.recordingLink) return false;

    if (from !== null || to !== null) {
      if (!s.sessionDate) return false;
      const t = new Date(s.sessionDate + "T00:00:00").getTime();
      if (from !== null && t < from) return false;
      if (to   !== null && t > to)   return false;
    }

    if (q) {
      const hay = [s.studentUserName, s.expectedStudent1, s.expectedStudent2, s.subject, s.enrollmentName]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }, [dSearch, dSubject, dGrade, dProcStatus, dPourCat, dRecording, dDateFrom, dDateTo]);

  const pourHistory = useMemo(() => {
    if (!drillData) return [];
    const entries: { date: string; student: string; cat: string; desc: string; demoId: number }[] = [];
    filteredDemos.forEach((d) => {
      d.pour.forEach((p) => {
        entries.push({ date: d.date, student: d.student, cat: p.cat, desc: p.desc, demoId: d.id });
      });
    });
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [drillData, filteredDemos]);

  const hasDrillFilters =
    !!dSearch || !!dSubject || !!dGrade || !!dDemoStatus || !!dProcStatus ||
    !!dPourCat || !!dMinRating || !!dRecording || !!dDateFrom || !!dDateTo;

  const clearDrillFilters = () => {
    setDSearch(""); setDSubject(""); setDGrade(""); setDDemoStatus("");
    setDProcStatus(""); setDPourCat(""); setDMinRating(""); setDRecording("");
    setDDateFrom(""); setDDateTo("");
  };

  const SS_BTN = "apple-input";

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p className="section-label">Step 11</p>
            <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Teacher performance.</h1>
            <p style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>Click any card to drill down. {filteredStats.length} teacher{filteredStats.length !== 1 ? "s" : ""}.</p>
          </div>
          <SearchableSelect
            variant="light"
            value={sortBy}
            onChange={setSortBy}
            placeholder="Sort"
            clearLabel="Default order"
            options={[
              { value: "rate-desc",    label: "Highest conversion" },
              { value: "rate-asc",     label: "Lowest conversion" },
              { value: "rating-desc",  label: "Highest rated" },
              { value: "volume-desc",  label: "Most demos" },
              { value: "name",         label: "Name A-Z" },
            ]}
          />
        </div>
      </section>

      <section style={{ background: "#fff", padding: "20px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* ── outer filter toolbar ──────────────────────────── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: showFilters ? 12 : 16, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="teachers-filter-panel"
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
              placeholder="Search teacher name, tid, student..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 320, fontSize: 14 }}
            />

            <span style={{ color: MUTED, fontSize: 13, marginLeft: "auto" }}>
              {filteredStats.length} teacher{filteredStats.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── outer filter panel ──────────────────────────── */}
          {showFilters && (
            <div
              id="teachers-filter-panel"
              className="animate-fade-up"
              style={{
                marginBottom: 24, padding: 16, background: LIGHT_GRAY, borderRadius: 14,
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 12, alignItems: "end",
              }}
            >
              <div style={FIELD}>
                <label style={LABEL}>Min demos</label>
                <SearchableSelect options={MIN_DEMOS_OPTS} value={fMinDemos} onChange={setFMinDemos} placeholder="Any volume" clearLabel="Any volume" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Conversion rate</label>
                <SearchableSelect options={CONVERSION_BUCKETS} value={fConv} onChange={setFConv} placeholder="Any rate" clearLabel="Any rate" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Min avg rating</label>
                <SearchableSelect options={RATING_OPTS} value={fRating} onChange={setFRating} placeholder="Any rating" clearLabel="Any rating" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Has POUR issues</label>
                <SearchableSelect options={YESNO} value={fHasPour} onChange={setFHasPour} placeholder="Any" clearLabel="Any" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>POUR category</label>
                <SearchableSelect options={toOpts(pourCats)} value={fPourCat} onChange={setFPourCat} placeholder="Any POUR" clearLabel="Any POUR" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Subject taught</label>
                <SearchableSelect options={toOpts(subjects)} value={fSubject} onChange={setFSubject} placeholder="All subjects" clearLabel="All subjects" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Level taught</label>
                <SearchableSelect options={toOpts(levels)} value={fLevel} onChange={setFLevel} placeholder="All levels" clearLabel="All levels" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Grade taught</label>
                <SearchableSelect options={toOpts(grades)} value={fGrade} onChange={setFGrade} placeholder="All grades" clearLabel="All grades" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Account type touched</label>
                <SearchableSelect options={toOpts(acctTypes)} value={fAcct} onChange={setFAcct} placeholder="All account types" clearLabel="All account types" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Has product log</label>
                <SearchableSelect options={YESNO} value={fProductLog} onChange={setFProductLog} placeholder="Any" clearLabel="Any" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Has demos</label>
                <SearchableSelect options={YESNO} value={fHasDemos} onChange={setFHasDemos} placeholder="Any" clearLabel="Any" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Has demo of status</label>
                <SearchableSelect options={DEMO_STATUS_OPTS} value={fDemoStatus} onChange={setFDemoStatus} placeholder="Any status" clearLabel="Any status" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Marketing leads</label>
                <SearchableSelect options={YESNO} value={fMarketing} onChange={setFMarketing} placeholder="Any" clearLabel="Any" buttonClassName={SS_BTN} width="100%" />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Teacher ID</label>
                <input className="apple-input" placeholder="Search tid" value={fTid} onChange={(e) => setFTid(e.target.value)} style={{ fontSize: 13 }} />
              </div>

              {hasFilters && (
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button type="button" onClick={clearFilters} style={{ background: "transparent", color: BLUE, border: `1px solid ${BLUE}`, padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", width: "100%" }}>
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── teacher card grid ─────────────────────────────────── */}
          {filteredStats.length === 0 ? (
            <EmptyState text="No teachers match the current filters" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {filteredStats.map((s, i) => (
                <div key={s.tid} className={"animate-fade-up-" + Math.min(i, 3)}
                  onClick={() => { setDrill(drill === String(s.tid) ? null : String(s.tid)); setTab("dashboard"); }}
                  style={{ background: LIGHT_GRAY, borderRadius: 16, padding: 20, border: drill === String(s.tid) ? "2px solid " + BLUE : "1px solid #e8e8ed", cursor: "pointer", transition: "all .2s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600 }}>{initials(s.name)}</div>
                    <div><div style={{ fontSize: 16, fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11, color: MUTED }}>ID: {s.tid} · {s.total} demos</div></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[{ l: "Conversion", v: s.rate + "%", c: s.rate >= 50 ? "#1b8a4a" : "#c13030" }, { l: "Rating", v: s.avg + "/5", c: BLUE }, { l: "Demos", v: s.total, c: NEAR_BLACK }, { l: "POUR", v: s.pours, c: s.pours ? "#B25000" : "#1b8a4a" }].map((m) => (
                      <div key={m.l} style={{ background: "#fff", borderRadius: 8, padding: "8px 12px" }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: m.c }}>{m.v}</div><div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{m.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {drillData && drillStats && (
          <div className="animate-slide-in" style={{ maxWidth: 1100, margin: "24px auto 0" }}>
            <div className="chart-card" style={{ padding: 28 }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 24, fontWeight: 600 }}>{drillData.name}</h3>
                  <p style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{drillStats.total} demo{drillStats.total !== 1 ? "s" : ""} · {drillStats.rate}% conversion · {drillStats.avg}/5 avg</p>
                </div>
                <button onClick={() => setDrill(null)} style={{ background: LIGHT_GRAY, border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
              </div>

              {/* ── drill filter toolbar — applies to all 4 tabs ───── */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: showDrillFilters ? 10 : 16, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setShowDrillFilters((v) => !v)}
                  aria-expanded={showDrillFilters}
                  aria-controls="teacher-drill-filter-panel"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 12px",
                    background: showDrillFilters ? BLUE : "transparent",
                    color: showDrillFilters ? "#fff" : BLUE,
                    border: `1px solid ${BLUE}`,
                    borderRadius: 10, fontSize: 13, fontWeight: 500,
                    cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                    <circle cx="9"  cy="6"  r="2.5" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="12" r="2.5" fill="currentColor" stroke="none" />
                    <circle cx="9"  cy="18" r="2.5" fill="currentColor" stroke="none" />
                  </svg>
                  Filters
                  {hasDrillFilters && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 14, height: 14, borderRadius: "50%",
                      background: showDrillFilters ? "rgba(255,255,255,0.35)" : BLUE,
                      color: "#fff", fontSize: 9, fontWeight: 700,
                    }}>•</span>
                  )}
                </button>
                <input
                  className="apple-input"
                  placeholder="Search student, subject, review text..."
                  value={dSearch}
                  onChange={(e) => setDSearch(e.target.value)}
                  style={{ maxWidth: 280, fontSize: 13 }}
                />
                <span style={{ color: MUTED, fontSize: 12, marginLeft: "auto" }}>
                  Applies to all 4 tabs
                </span>
              </div>

              {/* ── drill filter panel ──────────────────────────────── */}
              {showDrillFilters && (
                <div
                  id="teacher-drill-filter-panel"
                  className="animate-fade-up"
                  style={{
                    marginBottom: 16, padding: 14, background: LIGHT_GRAY, borderRadius: 12,
                    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10, alignItems: "end",
                  }}
                >
                  <div style={FIELD}>
                    <label style={LABEL}>Subject</label>
                    <SearchableSelect options={toOpts(dSubjectOpts)} value={dSubject} onChange={setDSubject} placeholder="All subjects" clearLabel="All subjects" buttonClassName={SS_BTN} width="100%" />
                  </div>

                  <div style={FIELD}>
                    <label style={LABEL}>Grade</label>
                    <SearchableSelect options={toOpts(dGradeOpts)} value={dGrade} onChange={setDGrade} placeholder="All grades" clearLabel="All grades" buttonClassName={SS_BTN} width="100%" />
                  </div>

                  <div style={FIELD}>
                    <label style={LABEL}>Demo status</label>
                    <SearchableSelect options={DEMO_STATUS_OPTS} value={dDemoStatus} onChange={setDDemoStatus} placeholder="Any demo status" clearLabel="Any demo status" buttonClassName={SS_BTN} width="100%" />
                  </div>

                  <div style={FIELD}>
                    <label style={LABEL}>Session processing</label>
                    <SearchableSelect options={PROC_STATUS_OPTS} value={dProcStatus} onChange={setDProcStatus} placeholder="Any processing" clearLabel="Any processing" buttonClassName={SS_BTN} width="100%" />
                  </div>

                  <div style={FIELD}>
                    <label style={LABEL}>POUR category</label>
                    <SearchableSelect options={toOpts(dPourOpts)} value={dPourCat} onChange={setDPourCat} placeholder="Any POUR" clearLabel="Any POUR" buttonClassName={SS_BTN} width="100%" />
                  </div>

                  <div style={FIELD}>
                    <label style={LABEL}>Min rating</label>
                    <SearchableSelect options={RATING_OPTS} value={dMinRating} onChange={setDMinRating} placeholder="Any rating" clearLabel="Any rating" buttonClassName={SS_BTN} width="100%" />
                  </div>

                  <div style={FIELD}>
                    <label style={LABEL}>Has recording</label>
                    <SearchableSelect options={YESNO} value={dRecording} onChange={setDRecording} placeholder="Any" clearLabel="Any" buttonClassName={SS_BTN} width="100%" />
                  </div>

                  <div style={FIELD}>
                    <label style={LABEL}>Date From</label>
                    <input type="date" className="apple-input" value={dDateFrom} onChange={(e) => setDDateFrom(e.target.value)} style={{ fontSize: 13 }} />
                  </div>

                  <div style={FIELD}>
                    <label style={LABEL}>Date To</label>
                    <input type="date" className="apple-input" value={dDateTo} onChange={(e) => setDDateTo(e.target.value)} style={{ fontSize: 13 }} />
                  </div>

                  {hasDrillFilters && (
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button type="button" onClick={clearDrillFilters} style={{ background: "transparent", color: BLUE, border: `1px solid ${BLUE}`, padding: "9px 14px", borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", width: "100%" }}>
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab bar */}
              <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
                {([
                  { key: "dashboard" as const, label: "Dashboard" },
                  ...(canSeeProductLog ? [{ key: "product" as const, label: "Product log" }] : []),
                  { key: "demos"     as const, label: "Demo logs" },
                  { key: "reviews"   as const, label: "Reviews" },
                ]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className="pill"
                    style={{
                      padding: "6px 16px", fontSize: 12, fontWeight: 600,
                      background: tab === t.key ? BLUE : LIGHT_GRAY,
                      color: tab === t.key ? "#fff" : MUTED,
                      border: tab === t.key ? "1px solid " + BLUE : "1px solid #e8e8ed",
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab 1: Dashboard */}
              {tab === "dashboard" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                    {[
                      { l: "Conversion", v: drillStats.rate + "%", c: drillStats.rate >= 50 ? "#1b8a4a" : "#c13030" },
                      { l: "Avg rating",  v: drillStats.avg + "/5", c: BLUE },
                      { l: "Total demos", v: drillStats.total,      c: NEAR_BLACK },
                      { l: "POUR issues", v: drillStats.pours,      c: drillStats.pours ? "#B25000" : "#1b8a4a" },
                    ].map((m) => (
                      <div key={m.l} style={{ background: LIGHT_GRAY, borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 600, color: m.c }}>{m.v}</div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{m.l}</div>
                      </div>
                    ))}
                  </div>
                  <TeacherScorecard demos={filteredDemos} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 16 }}>
                    <div>
                      <div className="section-label" style={{ marginBottom: 8 }}>Rating per demo</div>
                      {filteredDemos.length === 0 ? <EmptyState text="No demos match filters" /> : (
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={filteredDemos.map((d) => ({ name: d.date, rating: d.analystRating, student: d.student }))} barSize={16}>
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }} formatter={(v: number, _: string, p: { payload?: { student: string } }) => [v + "/5", p.payload?.student ?? ""]} />
                            <Bar dataKey="rating" fill={BLUE} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div>
                      <div className="section-label" style={{ marginBottom: 8 }}>POUR issues</div>
                      {Object.keys(drillStats.pourCats).length === 0 ? <EmptyState text="No POUR issues" /> : (
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={Object.entries(drillStats.pourCats).map(([k, v]) => ({ name: k, count: v }))} layout="vertical" barSize={12}>
                            <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: NEAR_BLACK }} axisLine={false} tickLine={false} width={70} />
                            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }} /><Bar dataKey="count" fill="#FF9F0A" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div>
                      <div className="section-label" style={{ marginBottom: 8 }}>
                        Accountability breakdown
                        <span style={{ fontWeight: 400, color: MUTED, marginLeft: 6 }}>
                          · {drillStats.finalisedCount} finalised · {drillStats.awaitingCount} awaiting
                        </span>
                      </div>
                      {drillStats.finalisedCount === 0 ? (
                        <EmptyState text="No finalised accountability yet" />
                      ) : (
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart
                            data={ACCT_FINAL_CATEGORIES.map((c) => ({
                              name: c.label,
                              count: drillStats.acctFinalCounts[c.value] ?? 0,
                            }))}
                            layout="vertical"
                            barSize={12}
                          >
                            <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: NEAR_BLACK }} axisLine={false} tickLine={false} width={100} />
                            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }} />
                            <Bar dataKey="count" fill={BLUE} radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Product log — every session for this teacher (all statuses) */}
              {tab === "product" && canSeeProductLog && (
                <TeacherProductLog teacherUserId={String(drillData.tid)} filterFn={sessionFilterFn} />
              )}

              {/* Tab 3: Demo logs */}
              {tab === "demos" && (
                <div>
                  {/* POUR issue history */}
                  <div className="section-label" style={{ marginBottom: 10 }}>POUR issue history</div>
                  {pourHistory.length === 0 ? (
                    <EmptyState text="No POUR issues for this teacher" />
                  ) : (
                    pourHistory.map((p, i) => (
                      <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span className="pour-tag">{p.cat}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{p.desc || "(no description)"}</div>
                          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{p.student} · {p.date}</div>
                        </div>
                      </div>
                    ))
                  )}

                  {/* POUR category breakdown chart */}
                  {Object.keys(drillStats.pourCats).length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <div className="section-label" style={{ marginBottom: 8 }}>POUR category breakdown</div>
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart data={Object.entries(drillStats.pourCats).map(([k, v]) => ({ name: k, count: v }))} layout="vertical" barSize={12}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: NEAR_BLACK }} axisLine={false} tickLine={false} width={70} />
                          <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }} />
                          <Bar dataKey="count" fill="#FF9F0A" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Accountability log */}
                  <div className="section-label" style={{ marginTop: 24, marginBottom: 10 }}>Accountability log</div>
                  {(() => {
                    const acctHistory = filteredDemos
                      .filter(
                        (d) =>
                          d.status === "Not Converted" &&
                          ((d.accountabilityFinal && d.accountabilityFinal.length > 0) || d.acctType)
                      )
                      .sort((a, b) => b.date.localeCompare(a.date));
                    const acctPill = (v: string) => {
                      const palette =
                        v === "Product"
                          ? { bg: "#FFF8E1", fg: "#8B6914" }
                          : v === "Sales"
                          ? { bg: "#E3F2FD", fg: "#0D47A1" }
                          : v === "Consumer"
                          ? { bg: "#E8F5E9", fg: "#1B5E20" }
                          : { bg: LIGHT_GRAY, fg: MUTED };
                      return palette;
                    };
                    return acctHistory.length === 0 ? (
                      <EmptyState text="No accountability records" />
                    ) : (
                      acctHistory.map((d) => {
                        const final = d.accountabilityFinal ?? [];
                        const isFinalised = !!d.accountabilityFinalAt;
                        return (
                          <div
                            key={d.id}
                            style={{
                              padding: "10px 14px",
                              borderBottom: "1px solid #f0f0f0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{d.student}</div>
                              <div style={{ fontSize: 11, color: MUTED }}>{d.date} · {d.level} {d.subject}</div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                              {isFinalised && final.length > 0 ? (
                                final.map((v) => {
                                  const p = acctPill(v);
                                  return (
                                    <span
                                      key={v}
                                      style={{
                                        padding: "3px 10px", borderRadius: 980, fontSize: 11, fontWeight: 600,
                                        background: p.bg, color: p.fg,
                                      }}
                                    >
                                      {acctFinalLabel(v)}
                                    </span>
                                  );
                                })
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
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    );
                  })()}

                  {/* Demo sessions list */}
                  <div className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>
                    {filteredDemos.length} demo session{filteredDemos.length !== 1 ? "s" : ""}
                  </div>
                  {filteredDemos.length === 0 ? (
                    <EmptyState text="No demo sessions recorded" />
                  ) : (
                    [...filteredDemos]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((d) => {
                        const draft = draftsByDemoId[d.id];
                        const hasReport = draft && isFinalized(draft);
                        return (
                          <Link key={d.id} href={`/analyst/${d.id}`} style={{
                            display: "block",
                            background: LIGHT_GRAY,
                            border: "1px solid #e8e8ed",
                            borderRadius: 12,
                            padding: "16px 20px",
                            marginBottom: 10,
                            textDecoration: "none",
                            color: "inherit",
                            cursor: "pointer",
                            transition: "border-color 0.15s",
                          }}>
                            {/* Top row: student info + status */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK }}>{d.student}</div>
                                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{d.date} · {d.level} · {d.subject}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <StatusBadge status={d.status} />
                                {hasReport && (
                                  <span style={{ color: BLUE, fontSize: 12, fontWeight: 600 }}>
                                    View report →
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Metrics row */}
                            <div style={{ display: "flex", gap: 16, marginBottom: d.review || d.pour.length > 0 || d.recording || d.verbatim || d.comments || d.agent ? 12 : 0, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>Rating</span>
                                <Stars value={d.analystRating} readOnly onChange={() => {}} />
                              </div>
                              {d.studentRaw > 0 && (
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>Student</span>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: NEAR_BLACK }}>{d.studentRaw}/10</span>
                                </div>
                              )}
                              {d.agent && (
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>Agent</span>
                                  <span style={{ fontSize: 13, fontWeight: 500, color: NEAR_BLACK }}>{d.agent}</span>
                                </div>
                              )}
                              {d.acctType && (
                                <span style={{
                                  padding: "2px 10px", borderRadius: 980, fontSize: 11, fontWeight: 600,
                                  background: d.acctType === "Product" ? "#FFF8E1" : d.acctType === "Sales" ? "#E3F2FD" : LIGHT_GRAY,
                                  color: d.acctType === "Product" ? "#8B6914" : d.acctType === "Sales" ? "#0D47A1" : MUTED,
                                  border: "1px solid #e8e8ed",
                                }}>
                                  {d.acctType}
                                </span>
                              )}
                              {d.marketing && (
                                <span style={{ padding: "2px 10px", borderRadius: 980, fontSize: 11, fontWeight: 600, background: "#E8F5E9", color: "#2E7D32", border: "1px solid #C8E6C9" }}>
                                  Marketing
                                </span>
                              )}
                            </div>

                            {/* POUR issues */}
                            {d.pour.length > 0 && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 6 }}>POUR Issues</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {d.pour.map((p, pi) => (
                                    <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e8e8ed", borderRadius: 8, padding: "4px 10px" }}>
                                      <span className="pour-tag" style={{ fontSize: 10 }}>{p.cat}</span>
                                      {p.desc && <span style={{ fontSize: 12, color: NEAR_BLACK }}>{p.desc}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Analyst review */}
                            {d.review && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Analyst review</div>
                                <p style={{ fontSize: 13, lineHeight: 1.5, color: NEAR_BLACK, margin: 0 }}>{d.review}</p>
                              </div>
                            )}

                            {/* Student verbatim */}
                            {d.verbatim && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Student verbatim</div>
                                <p style={{ fontSize: 13, lineHeight: 1.5, color: NEAR_BLACK, margin: 0, fontStyle: "italic" }}>&quot;{d.verbatim}&quot;</p>
                              </div>
                            )}

                            {/* Sales comments */}
                            {d.comments && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Sales comments</div>
                                <p style={{ fontSize: 13, lineHeight: 1.5, color: NEAR_BLACK, margin: 0 }}>{d.comments}</p>
                              </div>
                            )}

                            {/* Suggestions */}
                            {d.suggestions && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Suggestions</div>
                                <p style={{ fontSize: 13, lineHeight: 1.5, color: NEAR_BLACK, margin: 0 }}>{d.suggestions}</p>
                              </div>
                            )}

                            {/* Recording link */}
                            {d.recording && (
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Recording</div>
                                <span style={{ fontSize: 13, color: BLUE, fontWeight: 500 }}>
                                  Watch recording →
                                </span>
                              </div>
                            )}
                          </Link>
                        );
                      })
                  )}
                </div>
              )}

              {/* Tab 4: Reviews */}
              {tab === "reviews" && (
                <div>
                  <div className="section-label" style={{ marginBottom: 10 }}>Student & analyst feedback</div>
                  {(() => {
                    const reviewData = filteredDemos
                      .filter((d) => d.review || d.verbatim || d.feedbackComments || d.feedbackSuggestions)
                      .sort((a, b) => b.date.localeCompare(a.date));
                    return reviewData.length === 0 ? (
                      <EmptyState text="No reviews or feedback recorded" />
                    ) : (
                      reviewData.map((d) => (
                        <div key={d.id} style={{
                          background: "#fff", border: "1px solid #e8e8ed", borderRadius: 12,
                          padding: "14px 18px", marginBottom: 10,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 500 }}>{d.student}</div>
                              <div style={{ fontSize: 11, color: MUTED }}>{d.date} · {d.level} {d.subject}</div>
                            </div>
                            <StatusBadge status={d.status} />
                          </div>
                          {d.review && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Analyst review</div>
                              <p style={{ fontSize: 13, lineHeight: 1.47, color: NEAR_BLACK, margin: 0 }}>{d.review}</p>
                            </div>
                          )}
                          {d.verbatim && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Student verbatim</div>
                              <p style={{ fontSize: 13, lineHeight: 1.47, color: NEAR_BLACK, margin: 0, fontStyle: "italic" }}>&quot;{d.verbatim}&quot;</p>
                            </div>
                          )}
                          {d.feedbackSuggestions && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Improvement suggestions</div>
                              <p style={{ fontSize: 13, lineHeight: 1.47, color: NEAR_BLACK, margin: 0 }}>{d.feedbackSuggestions}</p>
                            </div>
                          )}
                          {d.feedbackComments && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Additional comments</div>
                              <p style={{ fontSize: 13, lineHeight: 1.47, color: NEAR_BLACK, margin: 0 }}>{d.feedbackComments}</p>
                            </div>
                          )}
                        </div>
                      ))
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
