"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/ui";
import { MUTED, NEAR_BLACK, type Demo, type DemoDraft } from "@/lib/types";
import {
  Q_KEYS,
  Q_META,
  SCORE_BUCKETS,
  avgPerQuestion,
  finalizedDraftsForDemos,
  isFinalized,
  scoreBucketIndex,
  scoreColor,
} from "@/lib/scorecard";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ttStyle = { borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 };

interface AnalyticsScorecardProps {
  demos: Demo[];
}

export function AnalyticsScorecard({ demos }: AnalyticsScorecardProps) {
  const { drafts } = useStore();

  const { finalized, distribution, perQuestion, heatmap } = useMemo(() => {
    const demoIds = demos.map((d) => d.id);
    const fin = finalizedDraftsForDemos(demoIds, drafts);

    // 1. Distribution histogram
    const dist = SCORE_BUCKETS.map((b) => ({ ...b, count: 0 }));
    for (const d of fin) dist[scoreBucketIndex(d.draft_data.total_score)].count++;

    // 2. Platform average per question — normalized for the bar (0..100),
    // plus raw avg + max for the tooltip label.
    const avgs = avgPerQuestion(fin);
    const perQ = Q_KEYS.map((k) => {
      const meta = Q_META[k];
      const avg = avgs[k];
      return {
        key: k,
        label: meta.shortLabel,
        avg,
        max: meta.max,
        ratio: meta.max === 0 ? 0 : (avg / meta.max) * 100,
      };
    });

    // 3. Teacher × Question heatmap — one row per teacher with ≥1 finalized draft.
    const demoByIdLocal = new Map(demos.map((d) => [d.id, d]));
    const byTeacher = new Map<string, DemoDraft[]>();
    for (const draft of drafts) {
      if (!isFinalized(draft)) continue;
      const demo = demoByIdLocal.get(draft.demo_id);
      if (!demo) continue;
      const list = byTeacher.get(demo.teacher);
      if (list) list.push(draft);
      else byTeacher.set(demo.teacher, [draft]);
    }
    const rows = [...byTeacher.entries()]
      .map(([teacher, ds]) => ({
        teacher,
        count: ds.length,
        avgs: avgPerQuestion(ds),
      }))
      .sort((a, b) => a.teacher.localeCompare(b.teacher));

    return {
      finalized: fin,
      distribution: dist,
      perQuestion: perQ,
      heatmap: rows,
    };
  }, [demos, drafts]);

  if (finalized.length === 0) {
    return (
      <section style={{ background: "#fff", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="chart-card">
            <div className="section-label">Scorecard</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 14px" }}>
              QA scorecard analytics
            </div>
            <EmptyState text="No reviewed drafts yet — finalize at least one draft to populate these charts" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={{ background: "#fff", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <p className="section-label">Scorecard</p>
          <h2 style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>
            QA scorecard analytics
          </h2>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>
            Based on {finalized.length} finalized draft{finalized.length === 1 ? "" : "s"}.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {/* Distribution */}
          <div className="chart-card">
            <div className="section-label">Distribution</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 14px" }}>
              Total score bands
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={distribution} barSize={36}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={ttStyle}
                  formatter={(v: number) => [`${v} draft${v === 1 ? "" : "s"}`, "Count"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {distribution.map((b, i) => (
                    <Cell key={i} fill={b.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-question platform average */}
          <div className="chart-card">
            <div className="section-label">Per question</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 14px" }}>
              Platform averages
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={perQuestion} layout="vertical" barSize={14}>
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  hide
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: NEAR_BLACK }}
                  axisLine={false}
                  tickLine={false}
                  width={92}
                />
                <Tooltip
                  contentStyle={ttStyle}
                  formatter={(
                    _v: number,
                    _n: string,
                    p: { payload?: { avg: number; max: number } },
                  ) => {
                    const pl = p.payload;
                    return pl ? [`${pl.avg.toFixed(2)}/${pl.max}`, "Avg"] : ["", ""];
                  }}
                />
                <Bar dataKey="ratio" radius={[0, 4, 4, 0]}>
                  {perQuestion.map((q, i) => (
                    <Cell key={i} fill={scoreColor(q.avg, q.max)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Teacher × Question heatmap */}
        <div className="chart-card" style={{ marginTop: 16 }}>
          <div className="section-label">Coaching map</div>
          <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 14px" }}>
            Teacher × question
          </div>
          {heatmap.length === 0 ? (
            <EmptyState text="No finalized drafts yet" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 3, fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: MUTED, fontWeight: 600, textTransform: "uppercase", fontSize: 10 }}>
                      Teacher
                    </th>
                    {Q_KEYS.map((k) => (
                      <th
                        key={k}
                        title={Q_META[k].label}
                        style={{ padding: "6px 4px", color: MUTED, fontWeight: 600, textTransform: "uppercase", fontSize: 10, textAlign: "center" }}
                      >
                        {Q_META[k].shortLabel}
                      </th>
                    ))}
                    <th style={{ padding: "6px 8px", color: MUTED, fontWeight: 600, textTransform: "uppercase", fontSize: 10, textAlign: "right" }}>
                      N
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {heatmap.map((row) => (
                    <tr key={row.teacher}>
                      <td style={{ padding: "6px 8px", fontWeight: 500, color: NEAR_BLACK, whiteSpace: "nowrap" }}>
                        {row.teacher}
                      </td>
                      {Q_KEYS.map((k) => {
                        const meta = Q_META[k];
                        const avg = row.avgs[k];
                        const color = scoreColor(avg, meta.max);
                        return (
                          <td
                            key={k}
                            title={`${meta.label}: avg ${avg.toFixed(2)}/${meta.max}`}
                            style={{
                              padding: "6px 4px",
                              background: color,
                              color: "#fff",
                              fontWeight: 600,
                              textAlign: "center",
                              borderRadius: 4,
                              minWidth: 44,
                            }}
                          >
                            {avg.toFixed(1)}
                          </td>
                        );
                      })}
                      <td style={{ padding: "6px 8px", color: MUTED, textAlign: "right" }}>
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
