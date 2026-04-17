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

const PAGE_SIZE = 25;

function statusBadge(e: Enrollment): { label: string; bg: string; fg: string } {
  if (e.enrollmentStatus === "Active") {
    return { label: "Active", bg: "#d4edda", fg: "#155724" };
  }
  if (e.enrollmentStatus === "Paused" && e.isPermanent) {
    return { label: "Permanent", bg: "#f8d7da", fg: "#721c24" };
  }
  if (e.enrollmentStatus === "Paused") {
    return { label: "Paused", bg: "#fff3cd", fg: "#856404" };
  }
  return { label: e.enrollmentStatus || "—", bg: "#f0f0f0", fg: "#86868b" };
}

function pauseWindow(e: Enrollment): string {
  if (!e.pauseStarts && !e.pauseEnds) return "—";
  if (e.pauseStarts && e.pauseEnds) return `${e.pauseStarts} → ${e.pauseEnds}`;
  return e.pauseStarts ?? e.pauseEnds ?? "—";
}

export default function EnrollmentsPage() {
  const { flash, setConfirm } = useStore();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fActionBy, setFActionBy] = useState("all");
  const [page, setPage] = useState(0);

  const fetchEnrollments = useCallback(async () => {
    const { data, error } = await supabase
      .from("enrollments")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      flash("Failed to load enrollments");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEnrollments((data ?? []).map((r: any) => dbRowToEnrollment(r)));
    setLoading(false);
  }, [flash]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  function handleClearAll() {
    if (enrollments.length === 0) {
      flash("No enrollments to clear");
      return;
    }
    setConfirm({
      title: "Clear all enrollments?",
      msg: `This permanently deletes all ${enrollments.length} enrollment${enrollments.length !== 1 ? "s" : ""} and any linked sessions. This cannot be undone.`,
      onConfirm: async () => {
        setClearing(true);
        const { error: sessErr } = await supabase
          .from("sessions")
          .delete()
          .gte("id", 0);
        if (sessErr) {
          flash(`Clear error (sessions): ${sessErr.message}`);
          setClearing(false);
          return;
        }
        const { error: enrErr } = await supabase
          .from("enrollments")
          .delete()
          .gte("id", 0);
        if (enrErr) {
          flash(`Clear error (enrollments): ${enrErr.message}`);
          setClearing(false);
          return;
        }
        flash("All enrollments cleared");
        setEnrollments([]);
        setPage(0);
        setClearing(false);
      },
    });
  }

  async function handleCSVParsed(rows: Record<string, string>[]) {
    if (rows.length === 0) {
      flash("CSV is empty or invalid");
      return;
    }
    setUploading(true);

    // Sort by Log ID desc so the newest event per enrollment comes first.
    const sorted = [...rows].sort((a, b) => {
      const aId = parseInt(a["logid"] ?? "0", 10) || 0;
      const bId = parseInt(b["logid"] ?? "0", 10) || 0;
      return bId - aId;
    });

    const mapped = sorted.map(mapEnrollmentRow);
    const withId = mapped.filter((r) => r.enrollment_id);
    const missingId = mapped.length - withId.length;

    // Dedupe by enrollment_id — keep first (= newest) occurrence.
    const seen = new Set<string>();
    const valid = withId.filter((r) => {
      if (seen.has(r.enrollment_id)) return false;
      seen.add(r.enrollment_id);
      return true;
    });
    const duplicates = withId.length - valid.length;

    if (valid.length === 0) {
      flash("No valid enrollment rows found");
      setUploading(false);
      return;
    }

    let totalCount = 0;
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500);
      const { data, error } = await supabase.rpc("upsert_enrollments", {
        payload: chunk,
      });
      if (error) {
        flash(`Upload error: ${error.message}`);
        setUploading(false);
        return;
      }
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

  const statuses = useMemo(() => {
    const s = new Set(enrollments.map((e) => e.enrollmentStatus).filter(Boolean));
    return Array.from(s).sort();
  }, [enrollments]);

  const actors = useMemo(() => {
    const s = new Set(enrollments.map((e) => e.actionBy).filter(Boolean));
    return Array.from(s).sort();
  }, [enrollments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enrollments.filter((e) => {
      if (fStatus !== "all" && e.enrollmentStatus !== fStatus) return false;
      if (fActionBy !== "all" && e.actionBy !== fActionBy) return false;
      if (
        q &&
        !e.teacherName.toLowerCase().includes(q) &&
        !e.studentName.toLowerCase().includes(q) &&
        !e.subject.toLowerCase().includes(q) &&
        !e.enrollmentId.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [enrollments, search, fStatus, fActionBy]);

  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
        <div
          className="animate-fade-up"
          style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}
        >
          <p className="section-label">Product Review</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>
            Enrollments.
          </h1>
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
                background: "transparent",
                color: "#c0392b",
                border: "1px solid #c0392b",
                padding: "8px 20px",
                borderRadius: 980,
                fontSize: 14,
                fontWeight: 500,
                cursor:
                  uploading || clearing || enrollments.length === 0
                    ? "not-allowed"
                    : "pointer",
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
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 24,
              alignItems: "center",
            }}
          >
            <input
              className="apple-input"
              placeholder="Search teacher, student, subject, ID..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              style={{ maxWidth: 320, fontSize: 14 }}
            />
            <select
              className="apple-select"
              value={fStatus}
              onChange={(e) => { setFStatus(e.target.value); setPage(0); }}
              style={{ fontSize: 14 }}
            >
              <option value="all">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="apple-select"
              value={fActionBy}
              onChange={(e) => { setFActionBy(e.target.value); setPage(0); }}
              style={{ fontSize: 14, maxWidth: 260 }}
            >
              <option value="all">All admins</option>
              {actors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span style={{ color: MUTED, fontSize: 13, marginLeft: "auto" }}>
              {filtered.length} enrollment{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

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
                      const title = e.additionalNotes
                        ? `Notes: ${e.additionalNotes}`
                        : undefined;
                      return (
                        <tr key={e.id} title={title}>
                          <td style={{ fontWeight: 500, fontSize: 13 }}>
                            {e.enrollmentId}
                          </td>
                          <td>{e.teacherName || "—"}</td>
                          <td>{e.studentName || "—"}</td>
                          <td>{e.subject || "—"}</td>
                          <td>{e.grade || "—"}</td>
                          <td>{e.board || "—"}</td>
                          <td>{e.curriculum || "—"}</td>
                          <td>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                padding: "2px 8px",
                                borderRadius: 980,
                                background: badge.bg,
                                color: badge.fg,
                              }}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, color: MUTED }}>
                            {pauseWindow(e)}
                          </td>
                          <td style={{ fontSize: 13, color: MUTED }}>
                            {e.actionBy || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 24,
                  }}
                >
                  <button
                    className="pill pill-outline"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    style={{
                      padding: "6px 16px",
                      fontSize: 13,
                      border: `1px solid ${page === 0 ? "#e5e5e5" : BLUE}`,
                      color: page === 0 ? MUTED : BLUE,
                      background: "transparent",
                      borderRadius: 980,
                      cursor: page === 0 ? "default" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 13, color: MUTED }}>
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    className="pill pill-outline"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    style={{
                      padding: "6px 16px",
                      fontSize: 13,
                      border: `1px solid ${page >= totalPages - 1 ? "#e5e5e5" : BLUE}`,
                      color: page >= totalPages - 1 ? MUTED : BLUE,
                      background: "transparent",
                      borderRadius: 980,
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
