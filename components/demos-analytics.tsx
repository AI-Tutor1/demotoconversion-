"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/ui";
import { AnalyticsScorecard } from "@/components/analytics-scorecard";
import { ACCT_FINAL_CATEGORIES, POUR_CATS, MUTED, BLUE, LIGHT_GRAY, NEAR_BLACK, CARD_DARK } from "@/lib/types";
import { ageDays, formatMonth } from "@/lib/utils";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from "recharts";

const ttStyle = { borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 };
const ACCT_COLOR: Record<string, string> = {
  Product:  "#FF9F0A",
  Sales:    BLUE,
  Consumer: "#30D158",
};

export default function DemosAnalytics() {
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

  // ─── Accountability (product-analyst finalisation) ───
  const finalisedDemos = useMemo(
    () => demos.filter((d) => !!d.accountabilityFinalAt),
    [demos]
  );
  const awaitingDemos = useMemo(
    () => demos.filter((d) => d.status === "Not Converted" && !d.accountabilityFinalAt),
    [demos]
  );

  // Category frequency — each demo contributes 1 to each of its finalised
  // categories. Totals can exceed demo count (intentional: multi-select).
  const acctFrequency = useMemo(() => {
    const m: Record<string, number> = { Product: 0, Sales: 0, Consumer: 0 };
    finalisedDemos.forEach((d) => {
      d.accountabilityFinal.forEach((c) => {
        if (m[c] !== undefined) m[c]++;
      });
    });
    return ACCT_FINAL_CATEGORIES.map((c) => ({
      name: c.label,
      value: c.value,
      count: m[c.value] ?? 0,
    }));
  }, [finalisedDemos]);

  // Combination buckets — each demo contributes to exactly ONE bucket, so
  // these bars always sum to finalisedDemos.length (the correctness check).
  const acctCombinations = useMemo(() => {
    const key = (cats: string[]): string => {
      const has = (c: string) => cats.includes(c);
      const short = (c: string) => c[0]; // P | S | C
      const ordered = ["Product", "Sales", "Consumer"].filter(has).map(short);
      return ordered.join("+") || "—";
    };
    const m: Record<string, number> = {};
    finalisedDemos.forEach((d) => {
      const k = key(d.accountabilityFinal);
      m[k] = (m[k] ?? 0) + 1;
    });
    const ORDER = ["P", "S", "C", "P+S", "P+C", "S+C", "P+S+C"];
    return ORDER.filter((k) => (m[k] ?? 0) > 0).map((k) => ({
      name: k,
      count: m[k] ?? 0,
    }));
  }, [finalisedDemos]);

  const acctAllocationTotal = useMemo(
    () => acctFrequency.reduce((s, a) => s + a.count, 0),
    [acctFrequency]
  );

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
    const contacted = demos.filter((d) => ["contacted", "converted", "lost"].includes(d.workflowStage ?? "")).length;
    const converted = demos.filter((d) => d.status === "Converted").length;
    return [{ stage: "Demos", count: t }, { stage: "Reviewed", count: reviewed }, { stage: "Contacted", count: contacted }, { stage: "Converted", count: converted }];
  }, [demos]);

  const subjectData = useMemo(() => {
    const m: Record<string, { name: string; total: number; conv: number }> = {};
    demos.forEach((d) => { const s = d.subject ?? "—"; if (!m[s]) m[s] = { name: s, total: 0, conv: 0 }; m[s].total++; if (d.status === "Converted") m[s].conv++; });
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

  // ─── Lead analytics ──────────────────────────────────────────
  // All lead metrics are derived solely from rangedDemos so they respect the
  // global date range filter. A lead "exists" here only if it has at least one
  // demo in the current range.
  const leadDemoMap = useMemo(() => {
    const m = new Map<number, { converted: boolean; demoCount: number; contacted: boolean }>();
    demos.filter((d) => d.leadId != null).forEach((d) => {
      const prev = m.get(d.leadId!) ?? { converted: false, demoCount: 0, contacted: false };
      m.set(d.leadId!, {
        converted: prev.converted || d.status === "Converted",
        demoCount: prev.demoCount + 1,
        contacted: prev.contacted || ["contacted", "converted", "lost"].includes(d.workflowStage ?? ""),
      });
    });
    return m;
  }, [demos]);

  const leadKpis = useMemo(() => {
    const total = leadDemoMap.size;
    const converted = [...leadDemoMap.values()].filter((v) => v.converted).length;
    const multiDemo = [...leadDemoMap.values()].filter((v) => v.demoCount > 1).length;
    const avgDemos = total ? (demos.filter((d) => d.leadId != null).length / total) : 0;
    return {
      total,
      convRate: total ? Math.round((converted / total) * 100) : 0,
      multiDemoRate: total ? Math.round((multiDemo / total) * 100) : 0,
      avgDemos: avgDemos.toFixed(1),
    };
  }, [leadDemoMap, demos]);

  const demosPerLeadDist = useMemo(() => {
    const dist = { "1 demo": 0, "2 demos": 0, "3+ demos": 0 };
    leadDemoMap.forEach((v) => {
      if (v.demoCount === 1) dist["1 demo"]++;
      else if (v.demoCount === 2) dist["2 demos"]++;
      else dist["3+ demos"]++;
    });
    return [
      { name: "1 demo",   count: dist["1 demo"] },
      { name: "2 demos",  count: dist["2 demos"] },
      { name: "3+ demos", count: dist["3+ demos"] },
    ];
  }, [leadDemoMap]);

  const leadFunnel = useMemo(() => {
    const total = leadDemoMap.size;
    const contacted = [...leadDemoMap.values()].filter((v) => v.contacted).length;
    const converted = [...leadDemoMap.values()].filter((v) => v.converted).length;
    return [
      { stage: "Leads",     count: total },
      { stage: "Contacted", count: contacted },
      { stage: "Converted", count: converted },
    ];
  }, [leadDemoMap]);

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

      {/* Accountability (product-analyst finalisation) */}
      <section style={{ background: LIGHT_GRAY, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 14 }}>
            <div className="section-label">Accountability</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 6px" }}>Loss attribution</div>
            <div style={{ fontSize: 12, color: MUTED }}>
              Finalised allocations by product analyst. A Not-Converted demo may carry multiple categories.
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div className="chart-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>Finalised</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: NEAR_BLACK, marginTop: 4 }}>{finalisedDemos.length}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                {acctAllocationTotal} allocation{acctAllocationTotal === 1 ? "" : "s"}
              </div>
            </div>
            <div className="chart-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase" }}>Awaiting accountability</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: awaitingDemos.length > 0 ? "#FF9F0A" : NEAR_BLACK, marginTop: 4 }}>
                {awaitingDemos.length}
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Not Converted &middot; no finalisation yet</div>
            </div>
          </div>

          {/* Frequency + combinations */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <div className="chart-card">
              <div className="section-label">Category frequency</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 10px" }}>
                Demos attributed to each category
              </div>
              {finalisedDemos.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={acctFrequency} layout="vertical" barSize={16}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: NEAR_BLACK }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip contentStyle={ttStyle} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {acctFrequency.map((entry) => (
                        <Cell key={entry.value} fill={ACCT_COLOR[entry.value] ?? BLUE} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text="No finalised accountability yet" />
              )}
              <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
                {finalisedDemos.length} demo{finalisedDemos.length === 1 ? "" : "s"} &middot; {acctAllocationTotal} allocation{acctAllocationTotal === 1 ? "" : "s"}
              </div>
            </div>

            <div className="chart-card">
              <div className="section-label">Combinations</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 10px" }}>
                How often categories appear together
              </div>
              {acctCombinations.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={acctCombinations} barSize={24}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={ttStyle} />
                    <Bar dataKey="count" fill={BLUE} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text="No finalised accountability yet" />
              )}
              <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
                P = Product, S = Sales, C = Consumer Issue
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Aging + Subject */}
      <section style={{ background: "#fff", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
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

      {/* Lead analytics */}
      <section style={{ background: LIGHT_GRAY, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="section-label">Leads</div>
          <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 16px" }}>Lead pipeline</div>
          {leadKpis.total === 0 ? (
            <EmptyState text="No leads with demos in this date range" />
          ) : (
            <>
              {/* KPI tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total leads",       value: leadKpis.total },
                  { label: "Lead conv. rate",   value: `${leadKpis.convRate}%` },
                  { label: "Multi-demo rate",   value: `${leadKpis.multiDemoRate}%` },
                  { label: "Avg demos / lead",  value: leadKpis.avgDemos },
                ].map((k) => (
                  <div key={k.label} style={{ background: "#fff", borderRadius: 14, padding: "16px 18px" }}>
                    <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: NEAR_BLACK, marginTop: 4 }}>{k.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Lead funnel */}
                <div className="chart-card">
                  <div className="section-label">Funnel</div>
                  <div style={{ fontSize: 17, fontWeight: 600, margin: "4px 0 12px" }}>Lead stages</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={leadFunnel} barSize={36}>
                      <XAxis dataKey="stage" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={ttStyle} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {leadFunnel.map((_, i) => <Cell key={i} fill={i === leadFunnel.length - 1 ? "#30D158" : BLUE} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Demos per lead */}
                <div className="chart-card">
                  <div className="section-label">Repeat demos</div>
                  <div style={{ fontSize: 17, fontWeight: 600, margin: "4px 0 12px" }}>Demos per lead</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={demosPerLeadDist} barSize={48}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={ttStyle} />
                      <Bar dataKey="count" fill={BLUE} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
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
