"use client";
import { EmptyState } from "@/components/ui";
import { BLUE, LIGHT_GRAY, MUTED, NEAR_BLACK } from "@/lib/types";
import { SCORECARD_MAX } from "@/lib/scorecard";
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

export interface SubjectRow {
  name: string;
  count: number;
  avgScore: number;
}

export interface DimensionRow {
  name: string;
  count: number;
}

export interface TurnaroundRow {
  name: string;
  count: number;
}

interface Props {
  subjects: SubjectRow[];
  grades: DimensionRow[];
  curricula: DimensionRow[];
  turnaround: TurnaroundRow[];
}

function scoreColor(score: number): string {
  const ratio = score / SCORECARD_MAX;
  if (ratio >= 0.8) return "#30D158";
  if (ratio >= 0.5) return "#FF9F0A";
  return "#E24B4A";
}

// LIGHT_GRAY band: subject grouped bars (primary) + grade/curriculum mini
// cards + turnaround histogram. Gives the "where quality varies" read.
export default function SessionsBreakdowns({ subjects, grades, curricula, turnaround }: Props) {
  const turnaroundTotal = turnaround.reduce((s, b) => s + b.count, 0);

  const subjectData = subjects.map((s) => ({
    ...s,
    avgPct: Math.round((s.avgScore / SCORECARD_MAX) * 100),
  }));

  return (
    <section style={{ background: LIGHT_GRAY, padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Breakdowns</div>
          <div style={{ fontSize: 21, fontWeight: 600, color: NEAR_BLACK, marginTop: 4 }}>
            Where quality varies
          </div>
        </div>

        {/* Subject primary chart */}
        <div className="chart-card" style={{ marginBottom: 16 }}>
          <div className="section-label">Subject</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 10px" }}>
            Approved volume &amp; avg score (top 10)
          </div>
          {subjectData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={subjectData} barGap={4}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={55}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <Tooltip
                  contentStyle={ttStyle}
                  formatter={(value: number, key: string) =>
                    key === "avgPct" ? [`${value}%`, "Avg score"] : [value, "Approved"]
                  }
                />
                <Bar yAxisId="left" dataKey="count" fill="#d2d2d7" radius={[3, 3, 0, 0]} name="Approved" />
                <Bar yAxisId="right" dataKey="avgPct" radius={[3, 3, 0, 0]} name="Avg score">
                  {subjectData.map((row) => (
                    <Cell key={row.name} fill={scoreColor(row.avgScore)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="No data" />
          )}
        </div>

        {/* Grade, Curriculum, Turnaround */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          <div className="chart-card">
            <div className="section-label">Grade</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 10px" }}>
              Approved by grade
            </div>
            {grades.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={grades.slice(0, 10)} layout="vertical" barSize={14}>
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
                    width={80}
                  />
                  <Tooltip contentStyle={ttStyle} />
                  <Bar dataKey="count" fill={BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="No data" />
            )}
          </div>

          <div className="chart-card">
            <div className="section-label">Curriculum</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 10px" }}>
              Approved by curriculum
            </div>
            {curricula.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={curricula.slice(0, 8)} layout="vertical" barSize={14}>
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
                    width={100}
                  />
                  <Tooltip contentStyle={ttStyle} />
                  <Bar dataKey="count" fill={BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="No data" />
            )}
          </div>

          <div className="chart-card">
            <div className="section-label">Turnaround</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 10px" }}>
              Ingest → approved (days)
            </div>
            {turnaroundTotal > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={turnaround} barSize={30}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={ttStyle} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {turnaround.map((row, i) => (
                      <Cell key={row.name} fill={i <= 1 ? "#30D158" : i === 2 ? BLUE : i === 3 ? "#FF9F0A" : "#E24B4A"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Missing review timestamps" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
