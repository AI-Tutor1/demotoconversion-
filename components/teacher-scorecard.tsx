"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/ui";
import { BLUE, MUTED, NEAR_BLACK, type Demo } from "@/lib/types";
import {
  Q_KEYS,
  Q_META,
  avgPerQuestion,
  avgTotalScore,
  finalizedDraftsForDemos,
  interpretationBadge,
  weakestQuestion,
} from "@/lib/scorecard";
import {
  LineChart,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TeacherScorecardProps {
  demos: Demo[];
}

export function TeacherScorecard({ demos }: TeacherScorecardProps) {
  const { drafts } = useStore();

  const { finalized, radarData, trendData, avgTotal, worst } = useMemo(() => {
    const ids = demos.map((d) => d.id);
    const fin = finalizedDraftsForDemos(ids, drafts);
    const avgs = avgPerQuestion(fin);
    const radar = Q_KEYS.map((k) => {
      const meta = Q_META[k];
      const avg = avgs[k];
      return {
        axis: meta.shortLabel,
        // Normalize so Q6 (binary) is visually comparable to Q1 (Likert 1-5).
        // Recharts draws 0..100 on the polar radius.
        ratio: meta.max === 0 ? 0 : (avg / meta.max) * 100,
        raw: avg,
        max: meta.max,
      };
    });

    // Map demo_id → demo.date to order the trend chronologically.
    const dateById = new Map(demos.map((d) => [d.id, d.date] as const));
    const trend = fin
      .map((d) => ({
        date: dateById.get(d.demo_id) ?? "",
        score: d.draft_data.total_score,
      }))
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10);

    return {
      finalized: fin,
      radarData: radar,
      trendData: trend,
      avgTotal: avgTotalScore(fin),
      worst: weakestQuestion(fin),
    };
  }, [demos, drafts]);

  if (finalized.length === 0) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div className="section-label" style={{ marginBottom: 8 }}>
          QA Scorecard summary
        </div>
        <EmptyState text="No reviewed drafts yet for this teacher" />
      </div>
    );
  }

  const badge = interpretationBadge(avgTotal);

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div className="section-label">QA Scorecard summary</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: NEAR_BLACK }}>
            {avgTotal.toFixed(1)}
            <span style={{ fontSize: 13, color: MUTED, fontWeight: 400 }}>/32</span>
          </span>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 980,
              background: badge.bg,
              color: badge.fg,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {badge.label}
          </span>
          <span style={{ fontSize: 11, color: MUTED }}>
            · Based on {finalized.length} reviewed demo{finalized.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            Per-question performance
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData} outerRadius="78%">
              <PolarGrid stroke="#e8e8ed" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: NEAR_BLACK }} />
              <PolarRadiusAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: MUTED }}
                tickCount={5}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }}
                formatter={(
                  _v: number,
                  _n: string,
                  p: { payload?: { raw: number; max: number } },
                ) => {
                  const pl = p.payload;
                  return pl ? [`${pl.raw.toFixed(1)}/${pl.max}`, "Avg"] : ["", ""];
                }}
              />
              <Radar
                dataKey="ratio"
                stroke={BLUE}
                fill={BLUE}
                fillOpacity={0.25}
                isAnimationActive={false}
              />
            </RadarChart>
          </ResponsiveContainer>
          {worst && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                background: "#FFF8E1",
                border: "1px solid #F5D98E",
                borderRadius: 8,
                fontSize: 12,
                color: "#8B6914",
              }}
            >
              <strong>Coaching focus:</strong> {worst.label} — avg {worst.avg.toFixed(1)}/{worst.max}
            </div>
          )}
        </div>

        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            Score trend (last {trendData.length})
          </div>
          {trendData.length < 2 ? (
            <EmptyState text="Need ≥2 reviewed demos to show a trend" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 12, right: 12, bottom: 4, left: -12 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 32]}
                  tick={{ fontSize: 10, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }}
                  formatter={(v: number) => [`${v}/32`, "Total"]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={BLUE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: BLUE }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
