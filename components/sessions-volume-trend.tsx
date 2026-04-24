"use client";
import { EmptyState } from "@/components/ui";
import { BLUE, LIGHT_GRAY, MUTED, NEAR_BLACK } from "@/lib/types";
import { SCORECARD_MAX } from "@/lib/scorecard";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ttStyle = { borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 };

export interface MonthlyRow {
  m: string;
  count: number;
  avgScore: number;
}

export interface AttendanceKpis {
  avgAttendancePct: number | null;
  durationDeltaMin: number | null;
  n: number;
}

interface Props {
  monthly: MonthlyRow[];
  attendance: AttendanceKpis;
}

function formatMinutes(delta: number | null): string {
  if (delta === null) return "—";
  const rounded = Math.round(delta);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "" : "";
  return `${sign}${rounded} min`;
}

function deltaColor(delta: number | null): string {
  if (delta === null) return NEAR_BLACK;
  if (Math.abs(delta) <= 2) return "#30D158";
  if (Math.abs(delta) <= 5) return "#FF9F0A";
  return "#E24B4A";
}

// LIGHT_GRAY band: monthly approved volume (area) + avg-score line overlay,
// plus 3 attendance/duration KPI tiles from LMS-provided columns.
export default function SessionsVolumeTrend({ monthly, attendance }: Props) {
  return (
    <section style={{ background: LIGHT_GRAY, padding: "36px 24px" }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        <div className="chart-card animate-fade-up-1" style={{ gridColumn: "1 / -1" }}>
          <div className="section-label">Volume</div>
          <div style={{ fontSize: 21, fontWeight: 600, color: NEAR_BLACK, margin: "4px 0 14px" }}>
            Monthly approved sessions &middot; avg score
          </div>
          {monthly.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={monthly}>
                <defs>
                  <linearGradient id="sg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BLUE} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, SCORECARD_MAX]}
                  tick={{ fontSize: 11, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={ttStyle} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="count"
                  stroke={BLUE}
                  strokeWidth={2}
                  fill="url(#sg1)"
                  name="Approved"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgScore"
                  stroke="#30D158"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#30D158" }}
                  name="Avg score"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Not enough data for a trend" />
          )}
          <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
            Bars = approved count per month. Line = mean total score (max {SCORECARD_MAX}).
          </div>
        </div>

        {/* Attendance + duration KPI tiles */}
        <AttendanceTile
          label="Avg attendance"
          value={
            attendance.avgAttendancePct === null
              ? "—"
              : `${Math.round(attendance.avgAttendancePct)}%`
          }
          sublabel={
            attendance.n === 0
              ? "No attendance recorded"
              : `${attendance.n} session${attendance.n === 1 ? "" : "s"} measured`
          }
          valueColor={
            attendance.avgAttendancePct === null
              ? NEAR_BLACK
              : attendance.avgAttendancePct >= 90
              ? "#30D158"
              : attendance.avgAttendancePct >= 70
              ? "#FF9F0A"
              : "#E24B4A"
          }
        />
        <AttendanceTile
          label="Duration delta"
          value={formatMinutes(attendance.durationDeltaMin)}
          sublabel="Tutor class time vs scheduled"
          valueColor={deltaColor(attendance.durationDeltaMin)}
        />
        <AttendanceTile
          label="Sessions scored"
          value={String(attendance.n)}
          sublabel="In this date range"
          valueColor={NEAR_BLACK}
        />
      </div>
    </section>
  );
}

function AttendanceTile({
  label,
  value,
  sublabel,
  valueColor,
}: {
  label: string;
  value: string;
  sublabel: string;
  valueColor: string;
}) {
  return (
    <div className="chart-card" style={{ padding: "18px 22px" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: MUTED,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: valueColor, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{sublabel}</div>
    </div>
  );
}
