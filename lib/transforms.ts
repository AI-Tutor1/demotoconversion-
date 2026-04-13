import type { Demo, PourIssue, WorkflowStage } from "./types";

// ─── DB row shapes ───────────────────────────────────────────

export type DemoRow = {
  id: number;
  date: string;
  teacher: string;
  tid: number;
  student: string;
  level: string;
  subject: string;
  review: string;
  methodology: string | null;
  engagement: string | null;
  student_raw: number;
  student_rating_5: number;
  analyst_rating: number;
  status: Demo["status"];
  suggestions: string;
  improvement: string | null;
  agent: string;
  comments: string;
  verbatim: string;
  acct_type: string;
  link: string;
  recording: string;
  topic_review: string;
  resources_review: string;
  effectiveness_review: string;
  marketing: boolean;
  ts: number;
  feedback_rating: number;
  feedback_explanation: boolean | null;
  feedback_explanation_comment: string;
  feedback_participation: boolean | null;
  feedback_participation_comment: string;
  feedback_confused: boolean | null;
  feedback_confused_detail: string;
  feedback_uncomfortable: boolean | null;
  feedback_uncomfortable_detail: string;
  feedback_positive_env: boolean | null;
  feedback_positive_env_comment: string;
  feedback_suggestions: string;
  feedback_comments: string;
  analyst_id: string | null;
  sales_agent_id: string | null;
  assigned_at: string | null;
  claimed_at: string | null;
  escalated_to: string | null;
  escalated_at: string | null;
  workflow_stage: string;
  transcript: string | null;
  ai_draft_id: string | null;
  ai_approval_rate: number | null;
  created_at: string;
  updated_at: string;
  pour_issues?: PourIssueRow[];
};

export type PourIssueRow = {
  category: string;
  description: string;
};

// ─── DB → App ────────────────────────────────────────────────

export function dbRowToDemo(row: DemoRow): Demo {
  return {
    id: Number(row.id),
    date: row.date,
    teacher: row.teacher,
    tid: row.tid,
    student: row.student,
    level: row.level,
    subject: row.subject,
    // POUR mapping — DB category/description → App cat/desc
    pour: (row.pour_issues ?? []).map((p) => ({
      cat: p.category,
      desc: p.description,
    })),
    review: row.review,
    methodology: row.methodology ?? undefined,
    engagement: row.engagement ?? undefined,
    studentRaw: row.student_raw,
    analystRating: row.analyst_rating,
    status: row.status,
    suggestions: row.suggestions,
    improvement: row.improvement ?? undefined,
    agent: row.agent,
    comments: row.comments,
    verbatim: row.verbatim,
    acctType: row.acct_type,
    link: row.link,
    recording: row.recording ?? "",
    transcript: row.transcript ?? null,
    topicReview: row.topic_review ?? "",
    resourcesReview: row.resources_review ?? "",
    effectivenessReview: row.effectiveness_review ?? "",
    marketing: row.marketing,
    ts: Number(row.ts),
    workflowStage: (row.workflow_stage as WorkflowStage) ?? "new",
    salesAgentId: row.sales_agent_id ?? null,
    analystId: row.analyst_id ?? null,
    feedbackRating: row.feedback_rating ?? 0,
    feedbackExplanation: row.feedback_explanation ?? null,
    feedbackExplanationComment: row.feedback_explanation_comment ?? "",
    feedbackParticipation: row.feedback_participation ?? null,
    feedbackParticipationComment: row.feedback_participation_comment ?? "",
    feedbackConfused: row.feedback_confused ?? null,
    feedbackConfusedDetail: row.feedback_confused_detail ?? "",
    feedbackUncomfortable: row.feedback_uncomfortable ?? null,
    feedbackUncomfortableDetail: row.feedback_uncomfortable_detail ?? "",
    feedbackPositiveEnv: row.feedback_positive_env ?? null,
    feedbackPositiveEnvComment: row.feedback_positive_env_comment ?? "",
    feedbackSuggestions: row.feedback_suggestions ?? "",
    feedbackComments: row.feedback_comments ?? "",
  };
}

// ─── App → DB (full row, for INSERT) ─────────────────────────

function statusToStage(status: Demo["status"]): string {
  if (status === "Converted") return "converted";
  if (status === "Not Converted") return "lost";
  return "new";
}

export function demoToInsertRow(d: Demo): Record<string, unknown> {
  return {
    id: d.id,
    date: d.date,
    teacher: d.teacher,
    tid: d.tid,
    student: d.student,
    level: d.level,
    subject: d.subject,
    review: d.review,
    methodology: d.methodology ?? null,
    engagement: d.engagement ?? null,
    student_raw: d.studentRaw,
    analyst_rating: d.analystRating,
    status: d.status,
    suggestions: d.suggestions,
    improvement: d.improvement ?? null,
    agent: d.agent,
    comments: d.comments,
    verbatim: d.verbatim,
    acct_type: d.acctType,
    link: d.link,
    recording: d.recording ?? "",
    topic_review: d.topicReview ?? "",
    resources_review: d.resourcesReview ?? "",
    effectiveness_review: d.effectivenessReview ?? "",
    marketing: d.marketing,
    ts: d.ts,
    workflow_stage: d.workflowStage ?? statusToStage(d.status),
    sales_agent_id: d.salesAgentId ?? null,
    analyst_id: d.analystId ?? null,
    feedback_rating: d.feedbackRating ?? 0,
    feedback_explanation: d.feedbackExplanation,
    feedback_explanation_comment: d.feedbackExplanationComment ?? "",
    feedback_participation: d.feedbackParticipation,
    feedback_participation_comment: d.feedbackParticipationComment ?? "",
    feedback_confused: d.feedbackConfused,
    feedback_confused_detail: d.feedbackConfusedDetail ?? "",
    feedback_uncomfortable: d.feedbackUncomfortable,
    feedback_uncomfortable_detail: d.feedbackUncomfortableDetail ?? "",
    feedback_positive_env: d.feedbackPositiveEnv,
    feedback_positive_env_comment: d.feedbackPositiveEnvComment ?? "",
    feedback_suggestions: d.feedbackSuggestions ?? "",
    feedback_comments: d.feedbackComments ?? "",
  };
}

// ─── App → DB (partial, for UPDATE) ──────────────────────────

export function demoUpdatesToDb(partial: Partial<Demo>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("date" in partial) out.date = partial.date;
  if ("teacher" in partial) out.teacher = partial.teacher;
  if ("tid" in partial) out.tid = partial.tid;
  if ("student" in partial) out.student = partial.student;
  if ("level" in partial) out.level = partial.level;
  if ("subject" in partial) out.subject = partial.subject;
  if ("review" in partial) out.review = partial.review;
  if ("methodology" in partial) out.methodology = partial.methodology ?? null;
  if ("engagement" in partial) out.engagement = partial.engagement ?? null;
  if ("studentRaw" in partial) out.student_raw = partial.studentRaw;
  if ("analystRating" in partial) out.analyst_rating = partial.analystRating;
  // workflowStage explicit update takes precedence over status-derived value
  const hasExplicitStage =
    "workflowStage" in partial && partial.workflowStage !== undefined;
  if ("status" in partial && partial.status !== undefined) {
    out.status = partial.status;
    if (!hasExplicitStage) out.workflow_stage = statusToStage(partial.status);
  }
  if (hasExplicitStage) out.workflow_stage = partial.workflowStage;
  if ("suggestions" in partial) out.suggestions = partial.suggestions;
  if ("improvement" in partial) out.improvement = partial.improvement ?? null;
  if ("agent" in partial) out.agent = partial.agent;
  if ("comments" in partial) out.comments = partial.comments;
  if ("verbatim" in partial) out.verbatim = partial.verbatim;
  if ("acctType" in partial) out.acct_type = partial.acctType;
  if ("link" in partial) out.link = partial.link;
  if ("recording" in partial) out.recording = partial.recording ?? "";
  if ("topicReview" in partial) out.topic_review = partial.topicReview ?? "";
  if ("resourcesReview" in partial) out.resources_review = partial.resourcesReview ?? "";
  if ("effectivenessReview" in partial) out.effectiveness_review = partial.effectivenessReview ?? "";
  if ("marketing" in partial) out.marketing = partial.marketing;
  if ("ts" in partial) out.ts = partial.ts;
  if ("salesAgentId" in partial) out.sales_agent_id = partial.salesAgentId ?? null;
  if ("analystId" in partial) out.analyst_id = partial.analystId ?? null;
  if ("feedbackRating" in partial) out.feedback_rating = partial.feedbackRating ?? 0;
  if ("feedbackExplanation" in partial) out.feedback_explanation = partial.feedbackExplanation;
  if ("feedbackExplanationComment" in partial) out.feedback_explanation_comment = partial.feedbackExplanationComment ?? "";
  if ("feedbackParticipation" in partial) out.feedback_participation = partial.feedbackParticipation;
  if ("feedbackParticipationComment" in partial) out.feedback_participation_comment = partial.feedbackParticipationComment ?? "";
  if ("feedbackConfused" in partial) out.feedback_confused = partial.feedbackConfused;
  if ("feedbackConfusedDetail" in partial) out.feedback_confused_detail = partial.feedbackConfusedDetail ?? "";
  if ("feedbackUncomfortable" in partial) out.feedback_uncomfortable = partial.feedbackUncomfortable;
  if ("feedbackUncomfortableDetail" in partial) out.feedback_uncomfortable_detail = partial.feedbackUncomfortableDetail ?? "";
  if ("feedbackPositiveEnv" in partial) out.feedback_positive_env = partial.feedbackPositiveEnv;
  if ("feedbackPositiveEnvComment" in partial) out.feedback_positive_env_comment = partial.feedbackPositiveEnvComment ?? "";
  if ("feedbackSuggestions" in partial) out.feedback_suggestions = partial.feedbackSuggestions ?? "";
  if ("feedbackComments" in partial) out.feedback_comments = partial.feedbackComments ?? "";
  return out;
}

// ─── POUR: App → DB rows for INSERT ──────────────────────────

export function pourToDbRows(
  demoId: number,
  pour: PourIssue[]
): { demo_id: number; category: string; description: string }[] {
  return pour.map((p) => ({
    demo_id: demoId,
    category: p.cat,
    description: p.desc,
  }));
}
