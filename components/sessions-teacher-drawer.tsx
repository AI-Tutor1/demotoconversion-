"use client";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { teacherFullName } from "@/lib/teacher-transforms";
import {
  BLUE,
  LIGHT_GRAY,
  MUTED,
  NEAR_BLACK,
  POUR_CATS,
} from "@/lib/types";
import type { ApprovedSession, DemoDraft, DraftData } from "@/lib/types";
import {
  Q_KEYS,
  Q_META,
  SCORECARD_MAX,
  avgPerQuestion,
  avgTotalScore,
  interpretationBadge,
  scoreColor,
  weakestQuestion,
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

interface Props {
  groupKey: string | null;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-label" style={{ marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// Build synthetic DemoDraft objects from sessions so the scorecard helpers
// (avgPerQuestion, avgTotalScore, weakestQuestion) can be reused verbatim.
function sessionsAsDrafts(sessions: ApprovedSession[]): DemoDraft[] {
  return sessions.map((s) => ({
    id: `session-${s.id}`,
    demo_id: s.id,
    agent_name: "scorecard",
    draft_data: s.rawDraftData as DraftData,
    status: "approved",
    approval_rate: s.approvalRate,
    reviewed_by: s.reviewedBy,
    reviewed_at: s.reviewedAt,
    created_at: s.createdAt,
  }));
}

// Right-slide drawer that opens when a teacher card is clicked on the
// Sessions leaderboard. Shows all-time approved sessions for that teacher
// (not range-filtered) so the breakdown has a stable sample size.
export default function SessionsTeacherDrawer({ groupKey, onClose }: Props) {
  const { approvedSessions, approvedTeachers } = useStore();

  // Esc closes the drawer — not in accountability-drawer today but cheap
  // to add and mirrors the backdrop-click affordance on the keyboard.
  useEffect(() => {
    if (groupKey === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [groupKey, onClose]);

  const teacherSessions = useMemo<ApprovedSession[]>(() => {
    if (!groupKey) return [];
    return approvedSessions.filter((s) => sessionGroupKey(s) === groupKey);
  }, [approvedSessions, groupKey]);

  const { teacherName, hasStableId, teacherUserId } = useMemo(() => {
    const first = teacherSessions[0];
    const uid = first?.teacherUserId ?? null;
    // Prefer approved-teachers profile name when a stable FK exists.
    if (uid) {
      const profile = approvedTeachers.find((p) => String(p.tid) === uid);
      if (profile) {
        return { teacherName: teacherFullName(profile), hasStableId: true, teacherUserId: uid };
      }
      return { teacherName: first?.teacherUserName ?? "—", hasStableId: true, teacherUserId: uid };
    }
    return {
      teacherName: first?.teacherUserName ?? "—",
      hasStableId: false,
      teacherUserId: null,
    };
  }, [teacherSessions, approvedTeachers]);

  const drafts = useMemo(() => sessionsAsDrafts(teacherSessions), [teacherSessions]);
  const avgTotal = useMemo(() => avgTotalScore(drafts), [drafts]);
  const perQ = useMemo(() => avgPerQuestion(drafts), [drafts]);
  const weakest = useMemo(() => weakestQuestion(drafts), [drafts]);
  const badge = interpretationBadge(avgTotal);

  const perQData = Q_KEYS.map((k) => {
    const meta = Q_META[k];
    const avg = perQ[k];
    const ratio = meta.max === 0 ? 0 : avg / meta.max;
    return {
      name: meta.shortLabel,
      fullLabel: meta.label,
      ratio: Math.round(ratio * 100),
      avg: Number(avg.toFixed(2)),
      max: meta.max,
    };
  });

  const pourData = useMemo(() => {
    const m: Record<string, number> = {};
    POUR_CATS.forEach((c) => {
      m[c] = 0;
    });
    teacherSessions.forEach((s) => {
      s.pourIssues.forEach((p) => {
        if (m[p.category] !== undefined) m[p.category]++;
      });
    });
    return POUR_CATS.map((c) => ({ name: c, count: m[c] }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [teacherSessions]);

  const recentSessions = useMemo(
    () =>
      [...teacherSessions]
        .sort((a, b) => (b.sessionDate ?? "").localeCompare(a.sessionDate ?? ""))
        .slice(0, 10),
    [teacherSessions]
  );

  if (groupKey === null) return null;

  const n = teacherSessions.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Scorecard breakdown for ${teacherName}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          animation: "fadeIn 0.15s ease-out",
        }}
      />
      <div
        className="animate-slide-in"
        style={{
          position: "relative",
          width: 520,
          maxWidth: "100vw",
          background: "#fff",
          height: "100vh",
          overflowY: "auto",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          padding: "28px 28px 40px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 18,
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="section-label" style={{ marginBottom: 4 }}>Teacher scorecard</div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 600,
                lineHeight: 1.2,
                color: NEAR_BLACK,
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {teacherName}
            </h2>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
              {n} approved · avg {avgTotal.toFixed(1)}/{SCORECARD_MAX}
              {!hasStableId && (
                <span style={{ color: "#FF9F0A", marginLeft: 8, fontSize: 11 }}>
                  (missing stable id)
                </span>
              )}
            </div>
            {n > 0 && (
              <span
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "3px 10px",
                  borderRadius: 980,
                  fontSize: 11,
                  fontWeight: 600,
                  background: badge.bg,
                  color: badge.fg,
                }}
              >
                {badge.label}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
              color: MUTED,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {n === 0 ? (
          <div
            style={{
              background: LIGHT_GRAY,
              borderRadius: 12,
              padding: "18px 20px",
              fontSize: 13,
              color: MUTED,
            }}
          >
            No sessions for this teacher.
          </div>
        ) : (
          <>
            {/* Q1–Q8 ratios */}
            <Section title="Rubric (avg %)">
              <ResponsiveContainer width="100%" height={280}>
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
                    width={110}
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
                      <Cell key={row.name} fill={scoreColor(row.ratio, 100)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>

            {/* Weakest question spotlight */}
            {weakest && n >= 3 && (
              <Section title="Weakest question">
                <div
                  style={{
                    background: "#FFF8E1",
                    border: "1px solid #F5D98E",
                    borderRadius: 10,
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "#8B6914",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{weakest.label}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Avg {weakest.avg.toFixed(2)} / {weakest.max} · {Math.round(weakest.ratio * 100)}%
                  </div>
                </div>
              </Section>
            )}

            {/* POUR */}
            <Section title="POUR issues">
              {pourData.length === 0 ? (
                <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>No POUR issues logged.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, pourData.length * 26)}>
                  <BarChart data={pourData} layout="vertical" barSize={14}>
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
              )}
            </Section>

            {/* Recent sessions */}
            <Section title="Recent approved sessions">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recentSessions.map((s) => {
                  const color = scoreColor(s.scorecardTotal, SCORECARD_MAX);
                  const itemBadge = interpretationBadge(s.scorecardTotal);
                  return (
                    <Link
                      key={s.id}
                      href={`/sessions/${s.id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr auto auto",
                        gap: 10,
                        alignItems: "center",
                        background: LIGHT_GRAY,
                        border: "1px solid #e8e8ed",
                        borderRadius: 10,
                        padding: "10px 12px",
                        textDecoration: "none",
                        color: NEAR_BLACK,
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: MUTED, fontFamily: "var(--font-mono, ui-monospace)" }}>
                        {s.sessionDate ?? "—"}
                      </span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.studentUserName || s.expectedStudent1 || "—"}
                      </span>
                      <span style={{ color, fontWeight: 600 }}>
                        {s.scorecardTotal}/{SCORECARD_MAX}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 980,
                          fontSize: 10,
                          fontWeight: 600,
                          background: itemBadge.bg,
                          color: itemBadge.fg,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {itemBadge.label.split(" ")[0]}
                      </span>
                    </Link>
                  );
                })}
              </div>
              {teacherUserId && (
                <div style={{ marginTop: 10, textAlign: "right" }}>
                  <Link
                    href={`/teachers/${teacherUserId}`}
                    style={{ fontSize: 12, color: BLUE, fontWeight: 600, textDecoration: "none" }}
                  >
                    View full teacher profile →
                  </Link>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// Same grouping key as the leaderboard uses — keeps drawer/row identity in sync.
export function sessionGroupKey(s: { teacherUserId: string | null; teacherUserName: string | null }): string {
  if (s.teacherUserId) return `id:${s.teacherUserId}`;
  return `name:${(s.teacherUserName ?? "—").toLowerCase()}`;
}
