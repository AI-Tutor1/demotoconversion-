"use client";
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Stars, StatusBadge, EmptyState } from "@/components/ui";
import { LIGHT_GRAY, MUTED, BLUE, NEAR_BLACK } from "@/lib/types";
import { initials } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function TeachersPage() {
  const { rangedDemos: demos } = useStore();
  const [sortBy, setSortBy] = useState("rate-desc");
  const [drill, setDrill] = useState<string | null>(null);

  const tStats = useMemo(() => {
    const m: Record<string, { tid: number; total: number; conv: number; ratings: number[]; pours: number; pourCats: Record<string, number>; demos: typeof demos }> = {};
    demos.forEach((d) => {
      if (!m[d.teacher]) m[d.teacher] = { tid: d.tid, total: 0, conv: 0, ratings: [], pours: 0, pourCats: {}, demos: [] };
      const t = m[d.teacher]; t.total++;
      if (d.status === "Converted") t.conv++; t.ratings.push(d.analystRating);
      if (d.pour.length > 0) t.pours++; d.pour.forEach((p) => { t.pourCats[p.cat] = (t.pourCats[p.cat] || 0) + 1; });
      t.demos.push(d);
    });
    let arr = Object.entries(m).map(([name, s]) => ({ name, ...s, avg: s.ratings.length ? (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1) : "0", rate: s.total ? Math.round((s.conv / s.total) * 100) : 0 }));
    if (sortBy === "rate-desc") arr.sort((a, b) => b.rate - a.rate);
    if (sortBy === "rate-asc") arr.sort((a, b) => a.rate - b.rate);
    if (sortBy === "rating-desc") arr.sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));
    if (sortBy === "volume-desc") arr.sort((a, b) => b.total - a.total);
    if (sortBy === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [demos, sortBy]);

  const drillData = drill ? tStats.find((t) => t.name === drill) : null;

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p className="section-label">Step 11</p>
            <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Teacher performance.</h1>
            <p style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>Click any card to drill down. {tStats.length} teachers.</p>
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-select-light">
            <option value="rate-desc">Highest conversion</option><option value="rate-asc">Lowest conversion</option>
            <option value="rating-desc">Highest rated</option><option value="volume-desc">Most demos</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "20px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {tStats.map((s, i) => (
            <div key={s.name} className={"animate-fade-up-" + Math.min(i, 3)} onClick={() => setDrill(drill === s.name ? null : s.name)}
              style={{ background: LIGHT_GRAY, borderRadius: 16, padding: 20, border: drill === s.name ? "2px solid " + BLUE : "1px solid #e8e8ed", cursor: "pointer", transition: "all .2s" }}>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div><h3 style={{ fontSize: 24, fontWeight: 600 }}>{drill}</h3><p style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{drillData.total} demos · {drillData.rate}% conversion · {drillData.avg}/5 avg</p></div>
                <button onClick={() => setDrill(null)} style={{ background: LIGHT_GRAY, border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
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
              <div style={{ marginTop: 20 }}>
                <div className="section-label" style={{ marginBottom: 8 }}>Demo history</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>{["Date", "Student", "Level", "Subject", "Rating", "Status"].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid #e8e8ed", color: MUTED, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
                    <tbody>{drillData.demos.map((d) => (
                      <tr key={d.id} style={{ borderBottom: "1px solid #f5f5f7" }}>
                        <td style={{ padding: "6px 10px", color: MUTED }}>{d.date}</td>
                        <td style={{ padding: "6px 10px", fontWeight: 500 }}>{d.student}</td>
                        <td style={{ padding: "6px 10px" }}>{d.level}</td>
                        <td style={{ padding: "6px 10px" }}>{d.subject}</td>
                        <td style={{ padding: "6px 10px" }}><Stars value={d.analystRating} readOnly onChange={() => {}} /></td>
                        <td style={{ padding: "6px 10px" }}><StatusBadge status={d.status} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
