"use client";
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { StatusBadge, EmptyState } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { TEACHERS, LEVELS, SUBJECTS, LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK } from "@/lib/types";
import { isFinalized } from "@/lib/scorecard";
import { exportCSV } from "@/lib/utils";

export default function ConductedPage() {
  const { rangedDemos, draftsByDemoId } = useStore();

  const [fStatus, setFStatus]   = useState("all");
  const [fTeacher, setFTeacher] = useState("");
  const [fLevel, setFLevel]     = useState("");
  const [fSubject, setFSubject] = useState("");
  const [sortBy, setSortBy]     = useState("newest");

  const conducted = useMemo(
    () => rangedDemos,
    [rangedDemos]
  );

  const filtered = useMemo(() => {
    let list = conducted;
    if (fStatus !== "all") list = list.filter((d) => d.status === fStatus);
    if (fTeacher) list = list.filter((d) => d.teacher === fTeacher);
    if (fLevel) list = list.filter((d) => d.level === fLevel);
    if (fSubject) list = list.filter((d) => d.subject === fSubject);

    if (sortBy === "newest") list = [...list].sort((a, b) => b.ts - a.ts);
    if (sortBy === "oldest") list = [...list].sort((a, b) => a.ts - b.ts);
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
  }, [conducted, fStatus, fTeacher, fLevel, fSubject, sortBy, draftsByDemoId]);

  const anyFilter = fStatus !== "all" || fTeacher || fLevel || fSubject;

  const acctColor = (acctType: string) => {
    if (acctType === "Sales") return { bg: "#E3F2FD", fg: "#0D47A1" };
    if (acctType === "Product") return { bg: "#FFF8E1", fg: "#8B6914" };
    return { bg: LIGHT_GRAY, fg: MUTED };
  };

  const headers = ["Date", "Teacher", "Student", "Level", "Subject", "Score", "Status", "Agent", "Accountability", "Report"];

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Master record</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Conducted demos.</h1>
          <p style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>{conducted.length} demos conducted.</p>
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
            options={Array.from(new Set(TEACHERS.map((t) => t.name))).map((n) => ({ value: n, label: n }))}
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
              onClick={() => { setFStatus("all"); setFTeacher(""); setFLevel(""); setFSubject(""); }}
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
        <div style={{ maxWidth: 1200, margin: "0 auto", overflowX: "auto" }}>
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
                  const ac = acctColor(d.acctType);
                  return (
                    <tr
                      key={d.id}
                      style={{ borderBottom: "1px solid #f5f5f7" }}
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
                        {d.status === "Not Converted" && d.acctType ? (
                          <span style={{
                            padding: "3px 10px", borderRadius: 980, fontSize: 11, fontWeight: 600,
                            background: ac.bg, color: ac.fg,
                          }}>
                            {d.acctType}
                          </span>
                        ) : (
                          <span style={{ color: MUTED }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        {hasDraft ? (
                          <Link href={`/analyst/${d.id}`} style={{ color: BLUE, textDecoration: "none", fontWeight: 500 }}>
                            View →
                          </Link>
                        ) : (
                          <span style={{ color: MUTED }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
