// ─── DESIGN TOKENS (Apple DESIGN.md) ───
export const BLUE = "#0071e3";
export const NEAR_BLACK = "#1d1d1f";
export const LIGHT_GRAY = "#f5f5f7";
export const MUTED = "#86868b";
export const CARD_DARK = "#1c1c1e";

// ─── TYPES ───
export interface PourIssue {
  cat: string;
  desc: string;
}

export type WorkflowStage =
  | "new"
  | "assigned"
  | "under_review"
  | "pending_sales"
  | "contacted"
  | "converted"
  | "lost";

export interface Demo {
  id: number;
  date: string;
  teacher: string;
  tid: number;
  student: string;
  level: string;
  subject: string;
  pour: PourIssue[];
  review: string;
  methodology?: string;
  engagement?: string;
  topicReview: string;
  resourcesReview: string;
  effectivenessReview: string;
  studentRaw: number;
  analystRating: number;
  status: "Pending" | "Converted" | "Not Converted";
  suggestions: string;
  improvement?: string;
  agent: string;
  comments: string;
  verbatim: string;
  acctType: string;
  link: string;
  recording: string;
  transcript: string | null;
  marketing: boolean;
  ts: number;
  workflowStage: WorkflowStage;
  salesAgentId: string | null;
  analystId: string | null;
  // Structured student-feedback questions collected by the sales agent.
  // Booleans are nullable so "not answered" is distinguishable from Yes/No.
  feedbackRating: number;
  feedbackExplanation: boolean | null;
  feedbackExplanationComment: string;
  feedbackParticipation: boolean | null;
  feedbackParticipationComment: string;
  feedbackConfused: boolean | null;
  feedbackConfusedDetail: string;
  feedbackUncomfortable: boolean | null;
  feedbackUncomfortableDetail: string;
  feedbackPositiveEnv: boolean | null;
  feedbackPositiveEnvComment: string;
  feedbackSuggestions: string;
  feedbackComments: string;
}

// AI-generated draft output stored in the demo_drafts table.
// The shape of draft_data mirrors the Python agent's JSON output exactly
// (snake_case), so the JSONB column and this type are the same shape.
export interface ScoreEvidence {
  score: number;
  evidence: string;
}

export interface DraftData {
  q1_teaching_methodology: ScoreEvidence;
  q2_curriculum_alignment: ScoreEvidence;
  q3_student_interactivity: ScoreEvidence;
  q4_differentiated_teaching: ScoreEvidence;
  q5_psychological_safety: ScoreEvidence;
  q6_rapport_session_opening: ScoreEvidence;
  q7_technical_quality: ScoreEvidence;
  q8_formative_assessment: ScoreEvidence;
  total_score: number;
  score_interpretation: string;
  pour_issues: { category: string; description: string }[];
  overall_summary: string;
  improvement_suggestions: string;
  improvement_focus: string;
}

export type DemoDraftStatus =
  | "pending_review"
  | "approved"
  | "partially_edited"
  | "rejected";

export interface DemoDraft {
  id: string;
  demo_id: number;
  agent_name: string;
  draft_data: DraftData;
  status: DemoDraftStatus;
  approval_rate: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  user: string;
  target: string;
  time: string;
}

export interface Notification {
  id: number;
  text: string;
  time: string;
}

export interface Teacher {
  id: number;
  name: string;
  uid: number;
}

// ─── LOOKUPS ───
export const TEACHERS: Teacher[] = [
  { id: 1, name: "Shoaib Ghani", uid: 62 },
  { id: 2, name: "Rizwan Anwer", uid: 90 },
  { id: 3, name: "Sophia Abid", uid: 107 },
  { id: 4, name: "Nageena Arif", uid: 598 },
  { id: 5, name: "Inayat Karim", uid: 543 },
  { id: 6, name: "Rameesha Saleem", uid: 599 },
  { id: 7, name: "Hira Zafar", uid: 594 },
  { id: 8, name: "Maryam Imran", uid: 547 },
];

export const LEVELS = [
  "IGCSE", "A Level", "A2 Level", "O Level", "AS Level",
  "IB", "IB DP", "IB MYP", "IB PYP", "Grade 1-8",
  "GCSE", "AP", "University",
];

export const SUBJECTS = [
  "Mathematics", "Physics", "Chemistry", "Biology", "English",
  "Computer Science", "Economics", "Business Studies", "Psychology",
  "Further Mathematics", "Statistics", "ICT",
];

export const POUR_CATS = [
  "Video", "Interaction", "Technical", "Cancellation",
  "Resources", "Time", "No Show",
];

export const ACCT_TYPES = ["Sales", "Product", "Consumer"];
