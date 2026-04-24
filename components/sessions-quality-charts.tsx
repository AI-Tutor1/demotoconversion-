"use client";
import { EmptyState } from "@/components/ui";
import { BLUE, MUTED, NEAR_BLACK } from "@/lib/types";
import { type ScoreBucket } from "@/lib/scorecard";
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

export interface DistributionRow extends ScoreBucket {
  count: number;
}

export interface PerQuestionRow {
  key: string;
  label: string;
  shortLabel: string;
  avg: number;
  max: number;
  ratio: number; // 0..1
}

export interface PourRow {
  name: string;
  count: number;
}

interface Props {
  distribution: DistributionRow[];
  perQuestion: PerQuestionRow[];
  pour: PourRow[];
}

function ratioColor(r: number): string {
  if (r >= 0.8) return "#30D158";
  if (r >= 0.5) return "#FF9F0A";
  return "#E24B4A";
}

// White band holding three charts side-by-side: score distribution histogram,
// Q1–Q8 average bars (%), and POUR issue frequency.
export default function SessionsQualityCharts({ distribution, perQuestion, pour }: Props) {
  const distTotal = distribution.reduce((s, b) => s + b.count, 0);
  const perQTotal = perQuestion.reduce((s, q) => s + q.avg, 0);

  // Shape perQuestion into the % ratio Recharts needs for the bar.
  const perQData = perQuestion.map((q) => ({
    name: q.shortLabel,
    fullLabel: q.label,
    ratio: Math.round(q.ratio * 100),
    avg: Number(q.avg.toFixed(2)),
    max: q.max,
  }));

  return (
    <section style={{ background: "#fff", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Quality</div>
          <div style={{ fontSize: 21, fontWeight: 600, color: NEAR_BLACK, marginTop: 4 }}>
            Scorecard &amp; rubric breakdown
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {/* Score distribution */}
          <div className="chart-card animate-fade-up-1">
            <div className="section-label">Distribution</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 10px" }}>
              Total score buckets
            </div>
            {distTotal > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={distribution} barSize={36}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={ttStyle} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {distribution.map((b) => (
                      <Cell key={b.label} fill={b.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="No scored sessions yet" />
            )}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
              Buckets are 0–7 / 8–14 / 15–21 / 22–27 / 28–32 (max 32).
            </div>
          </div>

          {/* Per-question ratios */}
          <div className="chart-card animate-fade-up-2">
            <div className="section-label">Rubric</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 10px" }}>
              Avg score per question (%)
            </div>
            {perQTotal > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={perQData} layout="vertical" barSize={14}>
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: NEAR_BLACK }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={ttStyle}
                    formatter={(value: number, _name, { payload }) => [
                      `${value}% (${payload.avg} / ${payload.max})`,
                      payload.fullLabel,
                    ]}
                  />
                  <Bar dataKey="ratio" radius={[0, 4, 4, 0]}>
                    {perQData.map((row) => (
                      <Cell key={row.name} fill={ratioColor(row.ratio / 100)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="No scored sessions yet" />
            )}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
              Ratios are avg / max — Q6 (binary) is on the same 0–100% scale.
            </div>
          </div>

          {/* POUR frequency */}
          <div className="chart-card animate-fade-up-2">
            <div className="section-label">POUR</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 10px" }}>
              Issue categories
            </div>
            {pour.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={pour} layout="vertical" barSize={14}>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: NEAR_BLACK }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip contentStyle={ttStyle} />
                  <Bar dataKey="count" fill={BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="No POUR issues logged" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
