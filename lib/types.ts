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
  marketing: boolean;
  ts: number;
  workflowStage: WorkflowStage;
  salesAgentId: string | null;
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

export const AGENTS = ["Maryam", "Hoor", "Muhammad"];

export const ACCT_TYPES = ["Sales", "Product", "Consumer"];
