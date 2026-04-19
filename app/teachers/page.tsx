"use client";
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { Stars, StatusBadge, EmptyState } from "@/components/ui";
import { TeacherScorecard } from "@/components/teacher-scorecard";
import { TeacherProductLog } from "@/components/teacher-product-log";
import { SearchableSelect } from "@/components/searchable-select";
import { LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK, TEACHERS } from "@/lib/types";
import { initials } from "@/lib/utils";
import { isFinalized } from "@/lib/scorecard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type TabKey = "dashboard" | "product" | "demos" | "reviews";

export default function TeachersPage() {
  const { rangedDemos: demos, draftsByDemoId, user, approvedSessions, sessionTeachers } = useStore();
  const [sortBy, setSortBy] = useState("rate-desc");
  const [drill, setDrill] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const canSeeProductLog = user?.role === "analyst" || user?.role === "manager";

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
      const nameToTid = new Map(TEACHERS.map((t) => [t.name.toLowerCase(), t.uid]));
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
  }, [demos, sortBy, sessionTeachers, canSeeProductLog]);

  // drill holds the tid string (unique per teacher) rather than the name.
  const drillData = drill ? tStats.find((t) => String(t.tid) === drill) : null;

  const pourHistory = useMemo(() => {
    if (!drillData) return [];
    const entries: { date: string; student: string; cat: string; desc: string; demoId: number }[] = [];
    drillData.demos.forEach((d) => {
      d.pour.forEach((p) => {
        entries.push({ date: d.date, student: d.student, cat: p.cat, desc: p.desc, demoId: d.id });
      });
    });
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [drillData]);

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p className="section-label">Step 11</p>
            <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Teacher performance.</h1>
            <p style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>Click any card to drill down. {tStats.length} teachers.</p>
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
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {tStats.map((s, i) => (
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

        {drillData && (
          <div className="animate-slide-in" style={{ maxWidth: 1100, margin: "24px auto 0" }}>
            <div className="chart-card" style={{ padding: 28 }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 24, fontWeight: 600 }}>{drillData.name}</h3>
                  <p style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{drillData.total} demos · {drillData.rate}% conversion · {drillData.avg}/5 avg</p>
                </div>
                <button onClick={() => setDrill(null)} style={{ background: LIGHT_GRAY, border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
              </div>

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
                      { l: "Conversion", v: drillData.rate + "%", c: drillData.rate >= 50 ? "#1b8a4a" : "#c13030" },
                      { l: "Avg rating",  v: drillData.avg + "/5", c: BLUE },
                      { l: "Total demos", v: drillData.total,      c: NEAR_BLACK },
                      { l: "POUR issues", v: drillData.pours,      c: drillData.pours ? "#B25000" : "#1b8a4a" },
                    ].map((m) => (
                      <div key={m.l} style={{ background: LIGHT_GRAY, borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 600, color: m.c }}>{m.v}</div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{m.l}</div>
                      </div>
                    ))}
                  </div>
                  <TeacherScorecard demos={drillData.demos} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 16 }}>
                    <div>
                      <div className="section-label" style={{ marginBottom: 8 }}>Rating per demo</div>
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart data={drillData.demos.map((d) => ({ name: d.date, rating: d.analystRating, student: d.student }))} barSize={16}>
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }} formatter={(v: number, _: string, p: { payload?: { student: string } }) => [v + "/5", p.payload?.student ?? ""]} />
                          <Bar dataKey="rating" fill={BLUE} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <div className="section-label" style={{ marginBottom: 8 }}>POUR issues</div>
                      {Object.keys(drillData.pourCats).length === 0 ? <EmptyState text="No POUR issues" /> : (
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={Object.entries(drillData.pourCats).map(([k, v]) => ({ name: k, count: v }))} layout="vertical" barSize={12}>
                            <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: NEAR_BLACK }} axisLine={false} tickLine={false} width={70} />
                            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }} /><Bar dataKey="count" fill="#FF9F0A" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Product log — approved session scorecards for this teacher */}
              {tab === "product" && canSeeProductLog && (
                <TeacherProductLog teacherUserName={drillData.name} />
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
                  {Object.keys(drillData.pourCats).length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <div className="section-label" style={{ marginBottom: 8 }}>POUR category breakdown</div>
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart data={Object.entries(drillData.pourCats).map(([k, v]) => ({ name: k, count: v }))} layout="vertical" barSize={12}>
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
                    const acctHistory = drillData.demos
                      .filter((d) => d.status === "Not Converted" && d.acctType)
                      .sort((a, b) => b.date.localeCompare(a.date));
                    return acctHistory.length === 0 ? (
                      <EmptyState text="No accountability records" />
                    ) : (
                      acctHistory.map((d) => (
                        <div key={d.id} style={{ padding: "10px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{d.student}</div>
                            <div style={{ fontSize: 11, color: MUTED }}>{d.date} · {d.level} {d.subject}</div>
                          </div>
                          <span style={{
                            padding: "3px 10px", borderRadius: 980, fontSize: 11, fontWeight: 600,
                            background: d.acctType === "Product" ? "#FFF8E1" : d.acctType === "Sales" ? "#E3F2FD" : LIGHT_GRAY,
                            color: d.acctType === "Product" ? "#8B6914" : d.acctType === "Sales" ? "#0D47A1" : MUTED,
                          }}>
                            {d.acctType}
                          </span>
                        </div>
                      ))
                    );
                  })()}

                  {/* Demo sessions list */}
                  <div className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>
                    {drillData.demos.length} demo session{drillData.demos.length !== 1 ? "s" : ""}
                  </div>
                  {drillData.demos.length === 0 ? (
                    <EmptyState text="No demo sessions recorded" />
                  ) : (
                    [...drillData.demos]
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
                    const reviewData = drillData.demos
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
