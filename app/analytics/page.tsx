"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/ui";
import { AnalyticsScorecard } from "@/components/analytics-scorecard";
import { POUR_CATS, MUTED, BLUE, LIGHT_GRAY, NEAR_BLACK, CARD_DARK } from "@/lib/types";
import { ageDays, formatMonth } from "@/lib/utils";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from "recharts";

const ttStyle = { borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 };
const PIE_C = [BLUE, "#FF9F0A", MUTED];

export default function AnalyticsPage() {
  const { rangedDemos: demos } = useStore();

  const monthly = useMemo(() => {
    const m: Record<string, { m: string; demos: number; converted: number; ratings: number[] }> = {};
    demos.forEach((d) => {
      const mo = formatMonth(d.date);
      if (!m[mo]) m[mo] = { m: mo, demos: 0, converted: 0, ratings: [] };
      m[mo].demos++; if (d.status === "Converted") m[mo].converted++; m[mo].ratings.push(d.analystRating);
    });
    return Object.values(m).map((v) => ({ ...v, rate: v.demos ? Math.round((v.converted / v.demos) * 100) : 0 }));
  }, [demos]);

  const pourData = useMemo(() => {
    const m: Record<string, number> = {}; POUR_CATS.forEach((c) => { m[c] = 0; });
    demos.forEach((d) => d.pour.forEach((p) => { if (m[p.cat] !== undefined) m[p.cat]++; }));
    return POUR_CATS.map((c) => ({ name: c, count: m[c] })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
  }, [demos]);

  const acctData = useMemo(() => {
    const m: Record<string, number> = { Sales: 0, Product: 0, Consumer: 0 };
    demos.filter((d) => d.acctType).forEach((d) => { m[d.acctType]++; });
    return Object.entries(m).map(([k, v]) => ({ name: k, count: v }));
  }, [demos]);

  const agentData = useMemo(() => {
    const m: Record<string, { name: string; handled: number; converted: number }> = {};
    demos.filter((d) => d.agent).forEach((d) => {
      if (!m[d.agent]) m[d.agent] = { name: d.agent, handled: 0, converted: 0 };
      m[d.agent].handled++;
      if (d.status === "Converted") m[d.agent].converted++;
    });
    return Object.values(m).map((a) => ({ ...a, rate: a.handled ? Math.round((a.converted / a.handled) * 100) : 0 })).sort((a, b) => b.rate - a.rate);
  }, [demos]);

  const funnel = useMemo(() => {
    const t = demos.length;
    const reviewed = demos.filter((d) => d.review || d.analystRating > 0).length;
    const contacted = demos.filter((d) => ["contacted", "converted", "lost"].includes(d.workflowStage)).length;
    const converted = demos.filter((d) => d.status === "Converted").length;
    return [{ stage: "Demos", count: t }, { stage: "Reviewed", count: reviewed }, { stage: "Contacted", count: contacted }, { stage: "Converted", count: converted }];
  }, [demos]);

  const subjectData = useMemo(() => {
    const m: Record<string, { name: string; total: number; conv: number }> = {};
    demos.forEach((d) => { if (!m[d.subject]) m[d.subject] = { name: d.subject, total: 0, conv: 0 }; m[d.subject].total++; if (d.status === "Converted") m[d.subject].conv++; });
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [demos]);

  const agingData = useMemo(() => {
    const buckets = [{ name: "0-1d", count: 0 }, { name: "2-3d", count: 0 }, { name: "4-5d", count: 0 }, { name: "6d+", count: 0 }];
    demos.filter((d) => d.status === "Pending").forEach((d) => {
      const a = ageDays(d.ts);
      if (a <= 1) buckets[0].count++; else if (a <= 3) buckets[1].count++; else if (a <= 5) buckets[2].count++; else buckets[3].count++;
    });
    return buckets;
  }, [demos]);

  return (
    <>
      <section style={{ background: "#000", color: "#fff", padding: "88px 24px 40px", textAlign: "center" }}>
        <div className="animate-fade-up" style={{ maxWidth: 680, margin: "0 auto" }}>
          <p className="section-label" style={{ color: MUTED }}>Intelligence</p>
          <h1 style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.07, marginTop: 6 }}>Analytics.</h1>
          <p style={{ fontSize: 19, color: "rgba(255,255,255,.6)", marginTop: 12 }}>All metrics from live data. {demos.length} demos.</p>
        </div>
      </section>

      {/* Funnel */}
      <section style={{ background: LIGHT_GRAY, padding: "36px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="chart-card animate-fade-up-1">
            <div className="section-label">Pipeline</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 16px" }}>Conversion funnel</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
              {funnel.map((f, i) => {
                const pct = funnel[0].count ? f.count / funnel[0].count : 0;
                return (
                  <div key={f.stage} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: NEAR_BLACK }}>{f.count}</div>
                    <div style={{ width: "100%", background: i === funnel.length - 1 ? "#30D158" : BLUE, borderRadius: "6px 6px 0 0", height: Math.max(12, pct * 100), opacity: 1 - i * 0.15 }} />
                    <div style={{ fontSize: 10, color: MUTED, textAlign: "center" }}>{f.stage}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Trend + POUR */}
      <section style={{ background: "#fff", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <div className="chart-card animate-fade-up-1">
            <div className="section-label">Trend</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 14px" }}>Conversion rate</div>
            {monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={monthly}>
                  <defs><linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BLUE} stopOpacity={0.15} /><stop offset="100%" stopColor={BLUE} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="m" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip contentStyle={ttStyle} /><Area type="monotone" dataKey="rate" stroke={BLUE} strokeWidth={2} fill="url(#cg2)" name="Rate" unit="%" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState text="Need more data" />}
          </div>
          <div className="chart-card animate-fade-up-2">
            <div className="section-label">POUR</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 14px" }}>Issue categories</div>
            {pourData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={pourData} layout="vertical" barSize={12}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: NEAR_BLACK }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip contentStyle={ttStyle} /><Bar dataKey="count" fill={BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState text="No POUR issues" />}
          </div>
        </div>
      </section>

      {/* QA Scorecard analytics */}
      <AnalyticsScorecard demos={demos} />

      {/* Accountability + Aging + Subject */}
      <section style={{ background: LIGHT_GRAY, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <div className="chart-card">
            <div className="section-label">Accountability</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 12px" }}>Loss attribution</div>
            {acctData.some((a) => a.count > 0) ? (
              <>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart><Pie data={acctData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="count">{acctData.map((_, i) => <Cell key={i} fill={PIE_C[i]} />)}</Pie><Tooltip contentStyle={ttStyle} /></PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 4 }}>{acctData.map((a, i) => <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: MUTED }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: PIE_C[i] }} />{a.name} ({a.count})</div>)}</div>
              </>
            ) : <EmptyState text="No accountability data yet" />}
          </div>
          <div className="chart-card">
            <div className="section-label">SLA</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 12px" }}>Pending aging</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={agingData} barSize={28}><XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} /><Tooltip contentStyle={ttStyle} /><Bar dataKey="count" radius={[4, 4, 0, 0]}>{agingData.map((_, i) => <Cell key={i} fill={i <= 1 ? BLUE : i === 2 ? "#FF9F0A" : "#E24B4A"} />)}</Bar></BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <div className="section-label">Demand</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 12px" }}>By subject</div>
            {subjectData.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={subjectData} barSize={16}><XAxis dataKey="name" tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={45} /><YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} /><Tooltip contentStyle={ttStyle} /><Bar dataKey="total" fill="#d2d2d7" radius={[3, 3, 0, 0]} name="Demos" /><Bar dataKey="conv" fill="#30D158" radius={[3, 3, 0, 0]} name="Converted" /></BarChart>
              </ResponsiveContainer>
            ) : <EmptyState text="No data" />}
          </div>
        </div>
      </section>

      {/* Agent leaderboard */}
      <section style={{ background: "#000", color: "#fff", padding: "44px 24px 52px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}><p className="section-label" style={{ color: MUTED }}>Performance</p><h2 style={{ fontSize: 32, fontWeight: 600, marginTop: 6 }}>Sales agent leaderboard</h2></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {agentData.map((ag, i) => (
              <div key={ag.name} className="animate-fade-up-2" style={{ background: CARD_DARK, borderRadius: 16, padding: "24px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 36, fontWeight: 600, color: i === 0 ? "#FFD60A" : "rgba(255,255,255,.2)", lineHeight: 1 }}>#{i + 1}</div>
                <div style={{ fontSize: 19, fontWeight: 600, color: "#fff", marginTop: 6 }}>{ag.name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
                  {[{ l: "Conv. rate", v: ag.handled ? ag.rate + "%" : "\u2014", c: ag.rate >= 45 ? "#30D158" : "#FF9F0A" }, { l: "Handled", v: ag.handled, c: "#fff" }, { l: "Converted", v: ag.converted, c: "#2997ff" }].map((m) => (
                    <div key={m.l} style={{ background: "#2c2c2e", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 16, fontWeight: 600, color: m.c }}>{m.v}</div><div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{m.l}</div></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
