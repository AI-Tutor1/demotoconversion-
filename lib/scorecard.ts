// Shared QA Scorecard helpers — used by draft review, Teachers drill-down,
// Analytics, Sales detail panel, and Kanban cards.
//
// Data source: demo_drafts.draft_data (JSONB) loaded into useStore().drafts.
// All aggregation is client-side via useMemo (Law 2: no hardcoded chart data).

import type { DemoDraft, DraftData } from "./types";

// ─── Question metadata ────────────────────────────────────────

export type QKey =
  | "q1_teaching_methodology"
  | "q2_curriculum_alignment"
  | "q3_student_interactivity"
  | "q4_differentiated_teaching"
  | "q5_psychological_safety"
  | "q6_rapport_session_opening"
  | "q7_technical_quality"
  | "q8_formative_assessment";

export interface QMeta {
  label: string;
  shortLabel: string;
  scaleLabel: string;
  min: number;
  max: number;
}

export const Q_META: Record<QKey, QMeta> = {
  q1_teaching_methodology:    { label: "Q1 — Teaching Methodology",      shortLabel: "Methodology",    scaleLabel: "Likert 1-5",    min: 1, max: 5 },
  q2_curriculum_alignment:    { label: "Q2 — Curriculum Alignment",      shortLabel: "Curriculum",     scaleLabel: "Likert 1-5",    min: 1, max: 5 },
  q3_student_interactivity:   { label: "Q3 — Student Interactivity",     shortLabel: "Interactivity",  scaleLabel: "Frequency 0-3", min: 0, max: 3 },
  q4_differentiated_teaching: { label: "Q4 — Differentiated Teaching",   shortLabel: "Differentiated", scaleLabel: "Likert 1-5",    min: 1, max: 5 },
  q5_psychological_safety:    { label: "Q5 — Psychological Safety",      shortLabel: "Safety",         scaleLabel: "Likert 1-5",    min: 1, max: 5 },
  q6_rapport_session_opening: { label: "Q6 — Rapport & Session Opening", shortLabel: "Rapport",        scaleLabel: "Binary 0 or 1", min: 0, max: 1 },
  q7_technical_quality:       { label: "Q7 — Technical Quality",         shortLabel: "Technical",      scaleLabel: "Likert 1-5",    min: 1, max: 5 },
  q8_formative_assessment:    { label: "Q8 — Formative Assessment",      shortLabel: "Assessment",     scaleLabel: "Frequency 0-3", min: 0, max: 3 },
};

export const Q_KEYS: QKey[] = [
  "q1_teaching_methodology",
  "q2_curriculum_alignment",
  "q3_student_interactivity",
  "q4_differentiated_teaching",
  "q5_psychological_safety",
  "q6_rapport_session_opening",
  "q7_technical_quality",
  "q8_formative_assessment",
];

export const SCORECARD_MAX = 32; // 5+5+3+5+5+1+5+3

// ─── Color + interpretation ───────────────────────────────────

// Per-question color based on score ratio.
export function scoreColor(score: number, max: number): string {
  const ratio = max === 0 ? 0 : score / max;
  if (ratio >= 0.8) return "#30D158"; // green
  if (ratio >= 0.5) return "#FF9F0A"; // amber
  return "#E24B4A"; // red
}

// Interpretation bands for the 32-point scorecard.
export interface Interpretation {
  label: string;
  bg: string;
  fg: string;
}

export function interpretationBadge(total: number): Interpretation {
  if (total >= 28) return { label: "Excellent", bg: "#E8F5E9", fg: "#1B5E20" };
  if (total >= 22) return { label: "Good", bg: "#E3F2FD", fg: "#0D47A1" };
  if (total >= 15) return { label: "Below Standard", bg: "#FFF8E1", fg: "#8B6914" };
  return { label: "Significant Concerns", bg: "#FFEBEE", fg: "#B71C1C" };
}

// Map total_score → demo.analystRating (1-5), proportional to the bands.
export function totalToAnalystRating(total: number): number {
  if (total >= 28) return 5;
  if (total >= 22) return 4;
  if (total >= 15) return 3;
  if (total >= 8) return 2;
  return 1;
}

// Bucket index for distribution histograms. Buckets: 0-7 / 8-14 / 15-21 / 22-27 / 28-32.
export interface ScoreBucket {
  label: string;
  min: number;
  max: number;
  color: string;
}

export const SCORE_BUCKETS: ScoreBucket[] = [
  { label: "0-7",   min: 0,  max: 7,  color: "#E24B4A" },
  { label: "8-14",  min: 8,  max: 14, color: "#F08A3B" },
  { label: "15-21", min: 15, max: 21, color: "#FF9F0A" },
  { label: "22-27", min: 22, max: 27, color: "#4A90E2" },
  { label: "28-32", min: 28, max: 32, color: "#30D158" },
];

export function scoreBucketIndex(total: number): number {
  for (let i = 0; i < SCORE_BUCKETS.length; i++) {
    if (total <= SCORE_BUCKETS[i].max) return i;
  }
  return SCORE_BUCKETS.length - 1;
}

// ─── Aggregators ──────────────────────────────────────────────

// Drafts that are considered "finalized" — approved or partially edited.
// "pending_review" and "rejected" are excluded from platform/teacher stats.
export function isFinalized(d: DemoDraft): boolean {
  return d.status === "approved" || d.status === "partially_edited";
}

// Returns finalized drafts whose demo_id is in the given set.
export function finalizedDraftsForDemos(
  demoIds: Iterable<number>,
  drafts: DemoDraft[]
): DemoDraft[] {
  const idSet = new Set<number>();
  for (const id of demoIds) idSet.add(id);
  return drafts.filter((d) => idSet.has(d.demo_id) && isFinalized(d));
}

// Average score per question across a set of drafts. Returns a full Q_KEYS map;
// questions with zero samples return 0.
export type PerQuestionAvg = Record<QKey, number>;

export function avgPerQuestion(drafts: DemoDraft[]): PerQuestionAvg {
  const sums: Record<QKey, number> = Q_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<QKey, number>
  );
  for (const d of drafts) {
    const dd: DraftData = d.draft_data;
    for (const k of Q_KEYS) sums[k] += dd[k]?.score ?? 0;
  }
  const out = {} as PerQuestionAvg;
  const n = drafts.length;
  for (const k of Q_KEYS) out[k] = n === 0 ? 0 : sums[k] / n;
  return out;
}

// Average total_score across a set of drafts. Returns 0 for empty input.
export function avgTotalScore(drafts: DemoDraft[]): number {
  if (drafts.length === 0) return 0;
  let sum = 0;
  for (const d of drafts) sum += d.draft_data.total_score;
  return sum / drafts.length;
}

// Weakest question by ratio (avg / max) so Q6 (1-point) isn't perpetually
// flagged. Returns null when no drafts or every question has zero samples.
export interface WeakestQuestion {
  key: QKey;
  label: string;
  avg: number;
  max: number;
  ratio: number;
}

export function weakestQuestion(drafts: DemoDraft[]): WeakestQuestion | null {
  if (drafts.length === 0) return null;
  const avgs = avgPerQuestion(drafts);
  let worst: WeakestQuestion | null = null;
  for (const k of Q_KEYS) {
    const meta = Q_META[k];
    const avg = avgs[k];
    const ratio = meta.max === 0 ? 0 : avg / meta.max;
    if (!worst || ratio < worst.ratio) {
      worst = { key: k, label: meta.label, avg, max: meta.max, ratio };
    }
  }
  return worst;
}
