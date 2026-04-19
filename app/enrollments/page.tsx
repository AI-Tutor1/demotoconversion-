"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { LIGHT_GRAY, MUTED, BLUE } from "@/lib/types";
import type { Enrollment } from "@/lib/types";
import { dbRowToEnrollment } from "@/lib/review-transforms";
import { mapEnrollmentRow } from "@/lib/csv-parser";
import CSVUpload from "@/components/csv-upload";
import { EmptyState } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";

const PAGE_SIZE = 25;

function statusBadge(e: Enrollment): { label: string; bg: string; fg: string } {
  if (e.enrollmentStatus === "Active") return { label: "Active", bg: "#d4edda", fg: "#155724" };
  if (e.enrollmentStatus === "Paused" && e.isPermanent) return { label: "Permanent", bg: "#f8d7da", fg: "#721c24" };
  if (e.enrollmentStatus === "Paused") return { label: "Paused", bg: "#fff3cd", fg: "#856404" };
  return { label: e.enrollmentStatus || "—", bg: "#f0f0f0", fg: "#86868b" };
}

function pauseWindow(e: Enrollment): string {
  if (!e.pauseStarts && !e.pauseEnds) return "—";
  if (e.pauseStarts && e.pauseEnds) return `${e.pauseStarts} → ${e.pauseEnds}`;
  return e.pauseStarts ?? e.pauseEnds ?? "—";
}

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

// Build SearchableSelect option list from a string array.
function toOpts(arr: string[]) {
  return arr.map((v) => ({ value: v, label: v }));
}

export default function EnrollmentsPage() {
  const { flash, setConfirm } = useStore();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);

  // ── filter state — empty string means "show all" ──────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fActionBy, setFActionBy] = useState("");
  const [fTeacher, setFTeacher] = useState("");
  const [fStudent, setFStudent] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fBoard, setFBoard] = useState("");
  const [fCurriculum, setFCurriculum] = useState("");
  const [fEnrollId, setFEnrollId] = useState("");
  const [fTeacherId, setFTeacherId] = useState("");
  const [fStudentId, setFStudentId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  const fetchEnrollments = useCallback(async () => {
    const { data, error } = await supabase
      .from("enrollments")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) { flash("Failed to load enrollments"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEnrollments((data ?? []).map((r: any) => dbRowToEnrollment(r)));
    setLoading(false);
  }, [flash]);

  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);

  function handleClearAll() {
    if (enrollments.length === 0) { flash("No enrollments to clear"); return; }
    setConfirm({
      title: "Clear all enrollments?",
      msg: `This permanently deletes all ${enrollments.length} enrollment${enrollments.length !== 1 ? "s" : ""} and any linked sessions. This cannot be undone.`,
      onConfirm: async () => {
        setClearing(true);
        const { error: sessErr } = await supabase.from("sessions").delete().gte("id", 0);
        if (sessErr) { flash(`Clear error (sessions): ${sessErr.message}`); setClearing(false); return; }
        const { error: enrErr } = await supabase.from("enrollments").delete().gte("id", 0);
        if (enrErr) { flash(`Clear error (enrollments): ${enrErr.message}`); setClearing(false); return; }
        flash("All enrollments cleared");
        setEnrollments([]);
        setPage(0);
        setClearing(false);
      },
    });
  }

  async function handleCSVParsed(rows: Record<string, string>[]) {
    if (rows.length === 0) { flash("CSV is empty or invalid"); return; }
    setUploading(true);

    const sorted = [...rows].sort((a, b) => {
      const aId = parseInt(a["logid"] ?? "0", 10) || 0;
      const bId = parseInt(b["logid"] ?? "0", 10) || 0;
      return bId - aId;
    });

    const mapped = sorted.map(mapEnrollmentRow);
    const withId = mapped.filter((r) => r.enrollment_id);
    const missingId = mapped.length - withId.length;

    const seen = new Set<string>();
    const valid = withId.filter((r) => {
      if (seen.has(r.enrollment_id)) return false;
      seen.add(r.enrollment_id);
      return true;
    });
    const duplicates = withId.length - valid.length;

    if (valid.length === 0) { flash("No valid enrollment rows found"); setUploading(false); return; }

    let totalCount = 0;
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500);
      const { data, error } = await supabase.rpc("upsert_enrollments", { payload: chunk });
      if (error) { flash(`Upload error: ${error.message}`); setUploading(false); return; }
      totalCount += (data as number) ?? 0;
    }

    const extras: string[] = [];
    if (duplicates > 0) extras.push(`${duplicates} duplicate${duplicates !== 1 ? "s" : ""} deduped`);
    if (missingId > 0) extras.push(`${missingId} without ID skipped`);
    const suffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";
    flash(`${totalCount} enrollment${totalCount !== 1 ? "s" : ""} upserted${suffix}`);
    setUploading(false);
    setPage(0);
    fetchEnrollments();
  }

  // ── derived option lists — unique sorted values from live data ────────────
  function uniq(pick: (e: Enrollment) => string, arr: Enrollment[]) {
    return Array.from(new Set(arr.map(pick).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  const statuses    = useMemo(() => uniq((e) => e.enrollmentStatus, enrollments), [enrollments]);
  const actors      = useMemo(() => uniq((e) => e.actionBy,         enrollments), [enrollments]);
  const teachers    = useMemo(() => uniq((e) => e.teacherName ?? "", enrollments), [enrollments]);
  const students    = useMemo(() => uniq((e) => e.studentName ?? "", enrollments), [enrollments]);
  const subjects    = useMemo(() => uniq((e) => e.subject ?? "",     enrollments), [enrollments]);
  const grades      = useMemo(() => uniq((e) => e.grade ?? "",       enrollments), [enrollments]);
  const boards      = useMemo(() => uniq((e) => e.board ?? "",       enrollments), [enrollments]);
  const curricula   = useMemo(() => uniq((e) => e.curriculum ?? "",  enrollments), [enrollments]);
  const enrollIds   = useMemo(() => uniq((e) => e.enrollmentId ?? "", enrollments), [enrollments]);
  const teacherIds  = useMemo(() => uniq((e) => e.teacherId ?? "",   enrollments), [enrollments]);

  // ── filter predicate — empty string = no filter applied ──────────────────
  const filtered = useMemo(() => {
    const q    = search.toLowerCase();
    const sid  = fStudentId.toLowerCase().trim();
    const from = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const to   = dateTo   ? new Date(dateTo   + "T23:59:59").getTime() : null;

    return enrollments.filter((e) => {
      const teacherName  = (e.teacherName  ?? "").toLowerCase();
      const studentName  = (e.studentName  ?? "").toLowerCase();
      const subject      = (e.subject      ?? "").toLowerCase();
      const enrollmentId = (e.enrollmentId ?? "").toLowerCase();
      const studentId    = (e.studentId    ?? "").toLowerCase();

      if (fStatus     && e.enrollmentStatus        !== fStatus)     return false;
      if (fActionBy   && e.actionBy                !== fActionBy)   return false;
      if (fTeacher    && (e.teacherName    ?? "")  !== fTeacher)    return false;
      if (fStudent    && (e.studentName    ?? "")  !== fStudent)    return false;
      if (fSubject    && (e.subject        ?? "")  !== fSubject)    return false;
      if (fGrade      && (e.grade          ?? "")  !== fGrade)      return false;
      if (fBoard      && (e.board          ?? "")  !== fBoard)      return false;
      if (fCurriculum && (e.curriculum     ?? "")  !== fCurriculum) return false;
      if (fEnrollId   && (e.enrollmentId   ?? "")  !== fEnrollId)   return false;
      if (fTeacherId  && (e.teacherId      ?? "")  !== fTeacherId)  return false;
      if (sid         && !studentId.includes(sid))                  return false;

      if (from !== null || to !== null) {
        const iso = e.logCreatedAt || e.createdAt;
        if (!iso) return false;
        const t = new Date(iso).getTime();
        if (from !== null && t < from) return false;
        if (to   !== null && t > to)   return false;
      }

      if (q && !teacherName.includes(q) && !studentName.includes(q) && !subject.includes(q) && !enrollmentId.includes(q)) {
        return false;
      }
      return true;
    });
  }, [
    enrollments, search, fStatus, fActionBy, fTeacher, fStudent, fSubject,
    fGrade, fBoard, fCurriculum, fEnrollId, fTeacherId, fStudentId, dateFrom, dateTo,
  ]);

  const paged      = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const hasFilters =
    !!search || !!fStatus || !!fActionBy || !!fTeacher || !!fStudent ||
    !!fSubject || !!fGrade || !!fBoard || !!fCurriculum ||
    !!fEnrollId || !!fTeacherId || !!fStudentId || !!dateFrom || !!dateTo;

  function clearFilters() {
    setSearch(""); setFStatus(""); setFActionBy("");
    setFTeacher(""); setFStudent(""); setFSubject("");
    setFGrade(""); setFBoard(""); setFCurriculum("");
    setFEnrollId(""); setFTeacherId(""); setFStudentId("");
    setDateFrom(""); setDateTo(""); setPage(0);
  }

  const SS_BTN = "apple-input";   // trigger button class for every SearchableSelect

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Product Review</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Enrollments.</h1>
          <p style={{ color: MUTED, fontSize: 15, marginTop: 8 }}>
            Upload the LMS enrollment log CSV to refresh pause/resume state.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <CSVUpload
              label={uploading ? "Uploading..." : "Upload CSV"}
              onParsed={handleCSVParsed}
              disabled={uploading || clearing}
            />
            <button
              type="button"
              onClick={handleClearAll}
              disabled={uploading || clearing || enrollments.length === 0}
              style={{
                background: "transparent", color: "#c0392b", border: "1px solid #c0392b",
                padding: "8px 20px", borderRadius: 980, fontSize: 14, fontWeight: 500,
                cursor: uploading || clearing || enrollments.length === 0 ? "not-allowed" : "pointer",
                opacity: uploading || clearing || enrollments.length === 0 ? 0.5 : 1,
              }}
            >
              {clearing ? "Clearing..." : "Clear All"}
            </button>
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* ── toolbar ─────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: showFilters ? 12 : 24, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="enroll-filter-panel"
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
              placeholder="Search teacher, student, subject, ID..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              style={{ maxWidth: 320, fontSize: 14 }}
            />

            <span style={{ color: MUTED, fontSize: 13, marginLeft: "auto" }}>
              {filtered.length} enrollment{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── collapsible filter panel ─────────────────────────────────── */}
          {showFilters && (
            <div
              id="enroll-filter-panel"
              className="animate-fade-up"
              style={{
                marginBottom: 24, padding: 16, background: LIGHT_GRAY, borderRadius: 14,
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 12, alignItems: "end",
              }}
            >
              <div style={FIELD}>
                <label style={LABEL}>Teacher</label>
                <SearchableSelect
                  options={toOpts(teachers)}
                  value={fTeacher}
                  onChange={(v) => { setFTeacher(v); setPage(0); }}
                  placeholder="All teachers"
                  clearLabel="All teachers"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Student</label>
                <SearchableSelect
                  options={toOpts(students)}
                  value={fStudent}
                  onChange={(v) => { setFStudent(v); setPage(0); }}
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
                  onChange={(v) => { setFSubject(v); setPage(0); }}
                  placeholder="All subjects"
                  clearLabel="All subjects"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Grade</label>
                <SearchableSelect
                  options={toOpts(grades)}
                  value={fGrade}
                  onChange={(v) => { setFGrade(v); setPage(0); }}
                  placeholder="All grades"
                  clearLabel="All grades"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Board</label>
                <SearchableSelect
                  options={toOpts(boards)}
                  value={fBoard}
                  onChange={(v) => { setFBoard(v); setPage(0); }}
                  placeholder="All boards"
                  clearLabel="All boards"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Curriculum</label>
                <SearchableSelect
                  options={toOpts(curricula)}
                  value={fCurriculum}
                  onChange={(v) => { setFCurriculum(v); setPage(0); }}
                  placeholder="All curricula"
                  clearLabel="All curricula"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Status</label>
                <SearchableSelect
                  options={toOpts(statuses)}
                  value={fStatus}
                  onChange={(v) => { setFStatus(v); setPage(0); }}
                  placeholder="All statuses"
                  clearLabel="All statuses"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Admin</label>
                <SearchableSelect
                  options={toOpts(actors)}
                  value={fActionBy}
                  onChange={(v) => { setFActionBy(v); setPage(0); }}
                  placeholder="All admins"
                  clearLabel="All admins"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Enrollment ID</label>
                <SearchableSelect
                  options={toOpts(enrollIds)}
                  value={fEnrollId}
                  onChange={(v) => { setFEnrollId(v); setPage(0); }}
                  placeholder="All enroll IDs"
                  clearLabel="All enroll IDs"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Teacher ID</label>
                <SearchableSelect
                  options={toOpts(teacherIds)}
                  value={fTeacherId}
                  onChange={(v) => { setFTeacherId(v); setPage(0); }}
                  placeholder="All teacher IDs"
                  clearLabel="All teacher IDs"
                  buttonClassName={SS_BTN}
                  width="100%"
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Student ID</label>
                <input
                  className="apple-input"
                  placeholder="Search student_id"
                  value={fStudentId}
                  onChange={(e) => { setFStudentId(e.target.value); setPage(0); }}
                  style={{ fontSize: 13 }}
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Date From</label>
                <input
                  type="date"
                  className="apple-input"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                  style={{ fontSize: 13 }}
                />
              </div>

              <div style={FIELD}>
                <label style={LABEL}>Date To</label>
                <input
                  type="date"
                  className="apple-input"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
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

          {loading ? (
            <p style={{ color: MUTED, textAlign: "center", padding: 40 }}>Loading...</p>
          ) : filtered.length === 0 ? (
            <EmptyState text="No enrollments found. Upload a CSV to get started." />
          ) : (
            <>
              <div className="review-table-wrap">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>Enrollment ID</th>
                      <th>Teacher</th>
                      <th>Student</th>
                      <th>Subject</th>
                      <th>Grade</th>
                      <th>Board</th>
                      <th>Curriculum</th>
                      <th>Status</th>
                      <th>Pause Window</th>
                      <th>Action By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((e) => {
                      const badge = statusBadge(e);
                      const title = e.additionalNotes ? `Notes: ${e.additionalNotes}` : undefined;
                      return (
                        <tr key={e.id} title={title}>
                          <td style={{ fontWeight: 500, fontSize: 13 }}>{e.enrollmentId}</td>
                          <td>{e.teacherName || "—"}</td>
                          <td>{e.studentName || "—"}</td>
                          <td>{e.subject || "—"}</td>
                          <td>{e.grade || "—"}</td>
                          <td>{e.board || "—"}</td>
                          <td>{e.curriculum || "—"}</td>
                          <td>
                            <span style={{
                              fontSize: 12, fontWeight: 500, padding: "2px 8px",
                              borderRadius: 980, background: badge.bg, color: badge.fg,
                            }}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, color: MUTED }}>{pauseWindow(e)}</td>
                          <td style={{ fontSize: 13, color: MUTED }}>{e.actionBy || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
                  <button
                    className="pill pill-outline"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    style={{
                      padding: "6px 16px", fontSize: 13,
                      border: `1px solid ${page === 0 ? "#e5e5e5" : BLUE}`,
                      color: page === 0 ? MUTED : BLUE,
                      background: "transparent", borderRadius: 980,
                      cursor: page === 0 ? "default" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 13, color: MUTED }}>{page + 1} / {totalPages}</span>
                  <button
                    className="pill pill-outline"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    style={{
                      padding: "6px 16px", fontSize: 13,
                      border: `1px solid ${page >= totalPages - 1 ? "#e5e5e5" : BLUE}`,
                      color: page >= totalPages - 1 ? MUTED : BLUE,
                      background: "transparent", borderRadius: 980,
                      cursor: page >= totalPages - 1 ? "default" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
