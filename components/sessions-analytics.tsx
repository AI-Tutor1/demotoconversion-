"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/ui";
import { MUTED, POUR_CATS } from "@/lib/types";
import type { ApprovedSession, DemoDraft, DraftData } from "@/lib/types";
import { formatMonth } from "@/lib/utils";
import {
  SCORE_BUCKETS,
  avgPerQuestion,
  avgTotalScore,
  interpretationBadge,
  scoreBucketIndex,
  weakestQuestion,
  type QKey,
  Q_KEYS,
  Q_META,
} from "@/lib/scorecard";
import SessionsInterpretationRow, {
  type BandCounts,
} from "@/components/sessions-interpretation-row";
import SessionsVolumeTrend, {
  type AttendanceKpis,
  type MonthlyRow,
} from "@/components/sessions-volume-trend";
import SessionsQualityCharts, {
  type DistributionRow,
  type PerQuestionRow,
  type PourRow,
} from "@/components/sessions-quality-charts";
import SessionsBreakdowns, {
  type DimensionRow,
  type SubjectRow,
  type TurnaroundRow,
} from "@/components/sessions-breakdowns";
import SessionsTeacherLeaderboard, {
  type TeacherLeaderboardRow,
} from "@/components/sessions-teacher-leaderboard";
import SessionsReviewerLeaderboard, {
  type ReviewerLeaderboardRow,
} from "@/components/sessions-reviewer-leaderboard";
import SessionsTeacherDrawer, {
  sessionGroupKey,
} from "@/components/sessions-teacher-drawer";

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

export default function SessionsAnalytics() {
  const { rangedApprovedSessions: sessions, reviewerNames, user, dateRange } = useStore();
  const [drawerKey, setDrawerKey] = useState<string | null>(null);

  const canSee = user?.role === "analyst" || user?.role === "manager";

  // ─── Aggregations (all O(n), n ≤ 500) ───────────────────────

  const bandCounts: BandCounts = useMemo(() => {
    const out: BandCounts = { excellent: 0, good: 0, below: 0, concerns: 0, n: sessions.length };
    sessions.forEach((s) => {
      const label = interpretationBadge(s.scorecardTotal).label;
      if (label === "Excellent") out.excellent++;
      else if (label === "Good") out.good++;
      else if (label === "Below Standard") out.below++;
      else out.concerns++;
    });
    return out;
  }, [sessions]);

  const monthly: MonthlyRow[] = useMemo(() => {
    const m: Record<string, { m: string; count: number; sum: number }> = {};
    sessions.forEach((s) => {
      if (!s.sessionDate) return;
      const key = formatMonth(s.sessionDate);
      if (!m[key]) m[key] = { m: key, count: 0, sum: 0 };
      m[key].count++;
      m[key].sum += s.scorecardTotal;
    });
    return Object.values(m)
      .map((v) => ({
        m: v.m,
        count: v.count,
        avgScore: v.count === 0 ? 0 : Number((v.sum / v.count).toFixed(2)),
      }))
      .sort((a, b) => a.m.localeCompare(b.m));
  }, [sessions]);

  const distribution: DistributionRow[] = useMemo(() => {
    const dist = SCORE_BUCKETS.map((b) => ({ ...b, count: 0 }));
    sessions.forEach((s) => {
      const i = scoreBucketIndex(s.scorecardTotal);
      dist[i].count++;
    });
    return dist;
  }, [sessions]);

  const perQuestion: PerQuestionRow[] = useMemo(() => {
    const drafts = sessionsAsDrafts(sessions);
    const avgs = avgPerQuestion(drafts);
    return Q_KEYS.map((k: QKey) => {
      const meta = Q_META[k];
      const avg = avgs[k];
      const ratio = meta.max === 0 ? 0 : avg / meta.max;
      return {
        key: k,
        label: meta.label,
        shortLabel: meta.shortLabel,
        avg,
        max: meta.max,
        ratio,
      };
    });
  }, [sessions]);

  const pour: PourRow[] = useMemo(() => {
    const m: Record<string, number> = {};
    POUR_CATS.forEach((c) => {
      m[c] = 0;
    });
    sessions.forEach((s) => {
      s.pourIssues.forEach((p) => {
        if (m[p.category] !== undefined) m[p.category]++;
      });
    });
    return POUR_CATS.map((c) => ({ name: c, count: m[c] }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [sessions]);

  const subjects: SubjectRow[] = useMemo(() => {
    const m: Record<string, { name: string; count: number; sum: number }> = {};
    sessions.forEach((s) => {
      const name = (s.subject ?? "").trim() || "—";
      if (!m[name]) m[name] = { name, count: 0, sum: 0 };
      m[name].count++;
      m[name].sum += s.scorecardTotal;
    });
    return Object.values(m)
      .map((v) => ({ name: v.name, count: v.count, avgScore: v.count === 0 ? 0 : v.sum / v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [sessions]);

  const grades: DimensionRow[] = useMemo(
    () => dimensionCounts(sessions, (s) => (s.grade ?? "").trim() || "—"),
    [sessions]
  );

  const curricula: DimensionRow[] = useMemo(
    () => dimensionCounts(sessions, (s) => (s.curriculum ?? "").trim() || "—"),
    [sessions]
  );

  const turnaround: TurnaroundRow[] = useMemo(() => {
    const buckets: TurnaroundRow[] = [
      { name: "0–1d", count: 0 },
      { name: "2–3d", count: 0 },
      { name: "4–7d", count: 0 },
      { name: "8–14d", count: 0 },
      { name: "15d+", count: 0 },
    ];
    sessions.forEach((s) => {
      if (!s.createdAt || !s.reviewedAt) return;
      const t0 = Date.parse(s.createdAt);
      const t1 = Date.parse(s.reviewedAt);
      if (Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) return;
      const days = Math.floor((t1 - t0) / 86400000);
      if (days <= 1) buckets[0].count++;
      else if (days <= 3) buckets[1].count++;
      else if (days <= 7) buckets[2].count++;
      else if (days <= 14) buckets[3].count++;
      else buckets[4].count++;
    });
    return buckets;
  }, [sessions]);

  const attendance: AttendanceKpis = useMemo(() => {
    let expectedSum = 0;
    let attendedSum = 0;
    let deltaSum = 0;
    let deltaN = 0;
    let measured = 0;
    sessions.forEach((s) => {
      const expected =
        (s.expectedStudent1 ? 1 : 0) + (s.expectedStudent2 ? 1 : 0);
      if (expected > 0 && (s.attendedStudent1 !== null || s.attendedStudent2 !== null)) {
        const attended =
          (s.attendedStudent1 ? 1 : 0) + (s.attendedStudent2 ? 1 : 0);
        expectedSum += expected;
        attendedSum += attended;
        measured++;
      }
      if (s.tutorClassTime !== null && s.classScheduledDuration !== null) {
        deltaSum += s.tutorClassTime - s.classScheduledDuration;
        deltaN++;
      }
    });
    return {
      avgAttendancePct: expectedSum === 0 ? null : (attendedSum / expectedSum) * 100,
      durationDeltaMin: deltaN === 0 ? null : deltaSum / deltaN,
      n: measured,
    };
  }, [sessions]);

  const teacherLeaderboard: TeacherLeaderboardRow[] = useMemo(() => {
    interface Acc {
      groupKey: string;
      teacherUserId: string | null;
      teacherUserName: string;
      sessions: ApprovedSession[];
    }
    const m: Record<string, Acc> = {};
    sessions.forEach((s) => {
      const key = sessionGroupKey({
        teacherUserId: s.teacherUserId,
        teacherUserName: s.teacherUserName,
      });
      if (!m[key]) {
        m[key] = {
          groupKey: key,
          teacherUserId: s.teacherUserId ?? null,
          teacherUserName: (s.teacherUserName ?? "").trim() || "—",
          sessions: [],
        };
      }
      m[key].sessions.push(s);
    });
    return Object.values(m)
      .map((g) => {
        const drafts = sessionsAsDrafts(g.sessions);
        const avg = avgTotalScore(drafts);
        const weakest = weakestQuestion(drafts);
        return {
          groupKey: g.groupKey,
          teacherUserId: g.teacherUserId,
          teacherUserName: g.teacherUserName,
          count: g.sessions.length,
          avgScore: avg,
          weakest,
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore || b.count - a.count);
  }, [sessions]);

  const reviewerLeaderboard: ReviewerLeaderboardRow[] = useMemo(() => {
    interface Acc {
      reviewerId: string;
      count: number;
      approvalSum: number;
      approvalN: number;
    }
    const m: Record<string, Acc> = {};
    sessions.forEach((s) => {
      const id = s.reviewedBy;
      if (!id) return;
      if (!m[id]) m[id] = { reviewerId: id, count: 0, approvalSum: 0, approvalN: 0 };
      m[id].count++;
      if (s.approvalRate !== null) {
        m[id].approvalSum += s.approvalRate;
        m[id].approvalN++;
      }
    });
    return Object.values(m)
      .map((r) => ({
        reviewerId: r.reviewerId,
        name: reviewerNames[r.reviewerId] ?? `User ${r.reviewerId.slice(0, 6)}`,
        count: r.count,
        avgApproval: r.approvalN === 0 ? null : r.approvalSum / r.approvalN,
      }))
      .sort((a, b) => b.count - a.count);
  }, [sessions, reviewerNames]);

  const approvedCount = sessions.length;
  const rangeLabel = dateRangeLabel(dateRange);

  // Soft gate — RLS already empties approvedSessions for non-analyst/manager,
  // but short-circuit the whole body when role is wrong to avoid flashing
  // empty cards during auth transitions.
  if (!canSee) {
    return (
      <section style={{ background: "#000", color: "#fff", padding: "88px 24px 40px", textAlign: "center" }}>
        <div className="animate-fade-up" style={{ maxWidth: 680, margin: "0 auto" }}>
          <p className="section-label" style={{ color: MUTED }}>Intelligence</p>
          <h1 style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.07, marginTop: 6 }}>Sessions.</h1>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,.6)", marginTop: 12 }}>
            Session analytics are restricted to analyst &amp; manager roles.
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Hero */}
      <section style={{ background: "#000", color: "#fff", padding: "88px 24px 40px", textAlign: "center" }}>
        <div className="animate-fade-up" style={{ maxWidth: 680, margin: "0 auto" }}>
          <p className="section-label" style={{ color: MUTED }}>Intelligence</p>
          <h1 style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.07, marginTop: 6 }}>Sessions.</h1>
          <p style={{ fontSize: 19, color: "rgba(255,255,255,.6)", marginTop: 12 }}>
            {approvedCount} approved session{approvedCount === 1 ? "" : "s"} · {rangeLabel}
          </p>
        </div>
      </section>

      {approvedCount === 0 ? (
        <section style={{ background: "#fff", padding: "56px 24px 80px" }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <EmptyState text="No approved sessions in this date range" />
          </div>
        </section>
      ) : (
        <>
          <SessionsInterpretationRow totals={bandCounts} />
          <SessionsVolumeTrend monthly={monthly} attendance={attendance} />
          <SessionsQualityCharts distribution={distribution} perQuestion={perQuestion} pour={pour} />
          <SessionsBreakdowns
            subjects={subjects}
            grades={grades}
            curricula={curricula}
            turnaround={turnaround}
          />
          <SessionsTeacherLeaderboard rows={teacherLeaderboard} onOpen={setDrawerKey} />
          <SessionsReviewerLeaderboard rows={reviewerLeaderboard} />
        </>
      )}

      <SessionsTeacherDrawer groupKey={drawerKey} onClose={() => setDrawerKey(null)} />
    </>
  );
}

function dimensionCounts(
  sessions: ApprovedSession[],
  key: (s: ApprovedSession) => string
): DimensionRow[] {
  const m: Record<string, number> = {};
  sessions.forEach((s) => {
    const k = key(s);
    m[k] = (m[k] ?? 0) + 1;
  });
  return Object.entries(m)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function dateRangeLabel(range: string): string {
  switch (range) {
    case "7d":
      return "last 7 days";
    case "30d":
      return "last 30 days";
    case "90d":
      return "last 90 days";
    default:
      return "all time";
  }
}
