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
  grade: string;
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
  // Product-analyst accountability finalisation (layered on top of acctType).
  // acctType is the sales suggestion; accountabilityFinal is the authoritative
  // multi-select allocation set by an analyst/manager on /conducted.
  accountabilityFinal: string[];
  accountabilityFinalAt: string | null;
  accountabilityFinalBy: string | null;
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
  // TRUE for demos submitted by a sales agent that are awaiting analyst review.
  // Excluded from Dashboard KPIs, rangedDemos, Kanban, Analytics, and Teachers.
  // Flipped to FALSE by the analyst on scorecard approval.
  isDraft: boolean;
  // Lead linkage — null for demos created before the leads migration.
  leadId: number | null;
  leadNumber: string | null;
}

export interface Lead {
  id: number;
  leadNumber: string;
  studentName: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
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
  ts: number;
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

// ─── HR / TEACHER ONBOARDING ───
// Status lifecycle: candidate → interview_scheduled → (pending | approved | rejected | archived).
// Only 'approved' rows are visible to analyst/sales_agent (RLS-enforced; see
// supabase/migrations/20260421000104_teacher_profiles_rls.sql).
export type TeacherProfileStatus =
  | "candidate"
  | "interview_scheduled"
  | "pending"
  | "approved"
  | "rejected"
  | "archived";

export interface TeachingMatrixEntry {
  level: string;
  subject: string;
  curriculum: string;
  grade?: string;
}

export interface TeacherProfile {
  id: string;                          // UUID
  hrApplicationNumber: string;
  phoneNumber: string;
  email: string | null;
  firstName: string;
  lastName: string;
  cvLink: string | null;
  qualification: string | null;
  subjectsInterested: string[];
  teachingMatrix: TeachingMatrixEntry[];
  interviewRecordingLink: string | null;
  interviewNotes: string | null;       // legacy free-text (kept for backward compat)
  interviewRubric: InterviewRubric;    // structured HR answers keyed by question_key
  status: TeacherProfileStatus;
  tid: number | null;                  // Teacher User Number; NULL until approved
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectReason: string | null;
  tier: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── HR interview rubric (structured interviewer form) ────────────────
// Each answer carries a `value` (type depends on question) + optional `note`.
// Stored as JSONB on teacher_profiles.interview_rubric, keyed by question_key
// (so the catalog can be extended without a migration).
export type RubricAnswerValue = number | string | boolean | null;

export interface RubricAnswer {
  value: RubricAnswerValue;
  note: string;
}

export type InterviewRubric = Record<string, RubricAnswer>;

export type HrQuestionType = "score" | "yesno" | "choice" | "text";

export interface HrInterviewQuestion {
  key: string;            // stable identifier — the JSONB key
  label: string;
  category: string;
  type: HrQuestionType;
  hint?: string;
  // For 'score' questions — 1..max scale. Labels at each end help the scorer.
  scoreMax?: number;
  lowLabel?: string;
  highLabel?: string;
  // For 'choice' questions — enum-style options.
  choices?: { value: string; label: string }[];
  // If true, a note is required when the answer is present (e.g. red flags).
  requireNoteWhen?: (v: RubricAnswerValue) => boolean;
}

export const HR_INTERVIEW_QUESTIONS: readonly HrInterviewQuestion[] = [
  // ─── Behaviour & professionalism ──────────────────
  { key: "b_punctuality",      category: "Behaviour & professionalism", label: "Punctuality & preparedness",            type: "score", scoreMax: 5, lowLabel: "Late / unprepared", highLabel: "On time, ready" },
  { key: "b_demeanor",         category: "Behaviour & professionalism", label: "Professional demeanor",                 type: "score", scoreMax: 5, lowLabel: "Unprofessional",   highLabel: "Highly professional" },
  { key: "b_responsiveness",   category: "Behaviour & professionalism", label: "Responsiveness to feedback",            type: "score", scoreMax: 5, lowLabel: "Defensive",         highLabel: "Open, reflective" },
  { key: "b_red_flags",        category: "Behaviour & professionalism", label: "Red flags observed?",                   type: "yesno", hint: "If yes, the note is required", requireNoteWhen: (v) => v === true },

  // ─── Language competency ──────────────────────────
  { key: "l_english_fluency",  category: "Language competency",          label: "English fluency",                       type: "score", scoreMax: 5, lowLabel: "Poor",             highLabel: "Native-like" },
  { key: "l_articulation",     category: "Language competency",          label: "Clarity of articulation",               type: "score", scoreMax: 5, lowLabel: "Mumbled / unclear", highLabel: "Crisp, deliberate" },
  { key: "l_grammar",          category: "Language competency",          label: "Grammar & vocabulary",                  type: "score", scoreMax: 5, lowLabel: "Frequent errors",  highLabel: "Precise, varied" },

  // ─── Subject & teaching ───────────────────────────
  { key: "s_subject_depth",    category: "Subject & teaching",           label: "Subject mastery — depth",               type: "score", scoreMax: 5, lowLabel: "Surface-level",    highLabel: "Expert" },
  { key: "s_methodology",      category: "Subject & teaching",           label: "Teaching methodology clarity",          type: "score", scoreMax: 5, lowLabel: "No clear method",  highLabel: "Structured, intentional" },
  { key: "s_simplify",         category: "Subject & teaching",           label: "Ability to simplify complex concepts",  type: "score", scoreMax: 5, lowLabel: "Over-complicates",  highLabel: "Crystal clear" },
  { key: "s_experience",       category: "Subject & teaching",           label: "Prior teaching experience",             type: "text",  hint: "Describe years, boards, setting" },

  // ─── Setup & logistics ────────────────────────────
  { key: "t_av_quality",       category: "Setup & logistics",            label: "Audio/video quality adequate?",         type: "yesno" },
  { key: "t_internet_stable",  category: "Setup & logistics",            label: "Internet stability demonstrated?",      type: "yesno" },
  { key: "t_availability_fit", category: "Setup & logistics",            label: "Availability matches platform needs?",  type: "yesno" },

  // ─── Overall ───────────────────────────────────────
  { key: "o_hire_recommendation", category: "Overall",                    label: "Hire recommendation",                   type: "choice",
    choices: [
      { value: "strong_no",  label: "Strong no" },
      { value: "no",         label: "No" },
      { value: "maybe",      label: "Maybe / hold" },
      { value: "yes",        label: "Yes" },
      { value: "strong_yes", label: "Strong yes" },
    ],
  },
  { key: "o_interviewer_notes", category: "Overall",                     label: "Interviewer overall notes",             type: "text", hint: "Impressions, highlights, anything not captured above" },
] as const;

export const HR_INTERVIEW_CATEGORIES: readonly string[] = Array.from(
  new Set(HR_INTERVIEW_QUESTIONS.map((q) => q.category))
);

export type TeacherInterviewDraftStatus =
  | "pending_review"
  | "approved"
  | "partially_edited"
  | "rejected";

export interface TeacherInterviewDraft {
  id: string;                          // UUID
  teacherProfileId: string;
  transcript: string | null;
  agentName: string;
  draftData: DraftData | Record<string, unknown>;  // v1 uses demo DraftData shape
  status: TeacherInterviewDraftStatus;
  approvalRate: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface TeacherRate {
  id: string;
  teacherProfileId: string;
  curriculum: string;
  level: string;
  grade: string;
  subject: string;
  ratePerHour: number;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherAvailabilitySlot {
  id: string;
  teacherProfileId: string;
  dayOfWeek: number;      // 0=Mon … 6=Sun
  startTime: string;      // 'HH:MM:SS'
  endTime: string;
  timezone: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CURRICULA: readonly string[] = [
  "Cambridge",
  "Edexcel",
  "IB",
  "AQA",
  "Local",
] as const;

// Grade options keyed by level. Used by the rate-editor grade dropdown.
// Levels not in this map fall back to the generic GRADES array.
export const GRADE_OPTIONS_BY_LEVEL: Record<string, string[]> = {
  "IGCSE":    ["9", "10"],
  "O Level":  ["9", "10", "11"],
  "AS Level": ["AS"],
  "A Level":  ["AS", "A2"],
  "A2 Level": ["A2"],
  "IB":       ["Year 1", "Year 2"],
  "IB DP":    ["Year 1", "Year 2"],
  "IB MYP":   ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"],
};

export const WEEKDAYS: readonly string[] = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

// ─── LOOKUPS ───
// Full production roster (171 tutors). Internal `id` is 1..N, assigned in
// the CSV's natural order (uid descending). `uid` is the Tuitional user ID
// — the field that `demos.tid` references.
export const TEACHERS: Teacher[] = [
  { id: 1,   name: "Hasnain Badar",                uid: 784 },
  { id: 2,   name: "Maryam Qureshi",               uid: 776 },
  { id: 3,   name: "Aliza Shakeel",                uid: 775 },
  { id: 4,   name: "Aqsa Riaz",                    uid: 774 },
  { id: 5,   name: "Rida Durrani",                 uid: 773 },
  { id: 6,   name: "Hira Amran",                   uid: 772 },
  { id: 7,   name: "Noreen Farman",                uid: 771 },
  { id: 8,   name: "Nuha Hyath",                   uid: 770 },
  { id: 9,   name: "Muhammad Bin Khalid",          uid: 769 },
  { id: 10,  name: "Muhammad Ebraheem",            uid: 768 },
  { id: 11,  name: "Humaail Raja",                 uid: 764 },
  { id: 12,  name: "Asifa Tehseen",                uid: 762 },
  { id: 13,  name: "Sumbal Arshad",                uid: 761 },
  { id: 14,  name: "Faraz Latif",                  uid: 760 },
  { id: 15,  name: "Hadi Shahid",                  uid: 756 },
  { id: 16,  name: "Minahil Sohail",               uid: 750 },
  { id: 17,  name: "Abdullah Abu Saeed",           uid: 748 },
  { id: 18,  name: "Minahil Sohail",               uid: 747 },
  { id: 19,  name: "Hiba Rumman",                  uid: 746 },
  { id: 20,  name: "Talha Arif",                   uid: 745 },
  { id: 21,  name: "Faiq Lodhi",                   uid: 743 },
  { id: 22,  name: "Unaysah Naveed",               uid: 736 },
  { id: 23,  name: "Muhammed Kumail Ruhani",       uid: 735 },
  { id: 24,  name: "Areeba Saqib",                 uid: 730 },
  { id: 25,  name: "Nauman Nasir",                 uid: 729 },
  { id: 26,  name: "Afreen Mansoor",               uid: 728 },
  { id: 27,  name: "Unais Iqbal",                  uid: 727 },
  { id: 28,  name: "Yashal",                       uid: 726 },
  { id: 29,  name: "Sana Ali",                     uid: 716 },
  { id: 30,  name: "Maha Farooq",                  uid: 715 },
  { id: 31,  name: "Laiba Hameed",                 uid: 708 },
  { id: 32,  name: "Tester Teacher",               uid: 702 },
  { id: 33,  name: "Ines",                         uid: 701 },
  { id: 34,  name: "Tooba Khan",                   uid: 696 },
  { id: 35,  name: "Mohsin Raza",                  uid: 692 },
  { id: 36,  name: "Aida Chaudhry",                uid: 689 },
  { id: 37,  name: "Hunzilah Bilal",               uid: 684 },
  { id: 38,  name: "Javed Mushtaq",                uid: 680 },
  { id: 39,  name: "Beenish Azeem",                uid: 676 },
  { id: 40,  name: "Hira Saeed",                   uid: 670 },
  { id: 41,  name: "Zeeshan Abbasi",               uid: 666 },
  { id: 42,  name: "Fiza Imran",                   uid: 644 },
  { id: 43,  name: "Maryam Saeed",                 uid: 640 },
  { id: 44,  name: "Joseph Metry",                 uid: 639 },
  { id: 45,  name: "Hansa Amir",                   uid: 634 },
  { id: 46,  name: "Laiba Nadeem Khan",            uid: 630 },
  { id: 47,  name: "Faizan Altaf",                 uid: 628 },
  { id: 48,  name: "Ayesha Javed",                 uid: 626 },
  { id: 49,  name: "Iman Killani",                 uid: 622 },
  { id: 50,  name: "Asad Tariq",                   uid: 619 },
  { id: 51,  name: "Musharraf Ramzy",              uid: 617 },
  { id: 52,  name: "Lubna Kashif",                 uid: 614 },
  { id: 53,  name: "Sara Arshad",                  uid: 611 },
  { id: 54,  name: "Umm ul Baneen",                uid: 609 },
  { id: 55,  name: "Wasiq Khan",                   uid: 602 },
  { id: 56,  name: "Fatima Khalid",                uid: 601 },
  { id: 57,  name: "Zehra Saleem",                 uid: 600 },
  { id: 58,  name: "Rameesha Saleem",              uid: 599 },
  { id: 59,  name: "Nageena Arif",                 uid: 598 },
  { id: 60,  name: "Hira Zafar",                   uid: 594 },
  { id: 61,  name: "Mariam Sturgees",              uid: 592 },
  { id: 62,  name: "Muhammad Yamin",               uid: 585 },
  { id: 63,  name: "Alishba Shahzad",              uid: 583 },
  { id: 64,  name: "Tuitional Test",               uid: 582 },
  { id: 65,  name: "Tayyaba Sabir",                uid: 581 },
  { id: 66,  name: "Maryam Saleem",                uid: 576 },
  { id: 67,  name: "Ayesha Waqas",                 uid: 575 },
  { id: 68,  name: "Arubah Ghaffar",               uid: 569 },
  { id: 69,  name: "Ali Mirza",                    uid: 554 },
  { id: 70,  name: "Uzma Owais",                   uid: 552 },
  { id: 71,  name: "Aravinthan Bhascaran",         uid: 550 },
  { id: 72,  name: "Maryam Imran",                 uid: 547 },
  { id: 73,  name: "Inayat Karim",                 uid: 543 },
  { id: 74,  name: "Mariam Abbas",                 uid: 541 },
  { id: 75,  name: "Naadiya Rizvi",                uid: 537 },
  { id: 76,  name: "Aliza Jafri",                  uid: 534 },
  { id: 77,  name: "Ayman Noor",                   uid: 527 },
  { id: 78,  name: "Muhammad Taimoor",             uid: 522 },
  { id: 79,  name: "Zainab Fatima",                uid: 519 },
  { id: 80,  name: "Alishba binte Amir",           uid: 509 },
  { id: 81,  name: "Dur e Shahwar Imran",          uid: 488 },
  { id: 82,  name: "Fakhr e Alam",                 uid: 484 },
  { id: 83,  name: "wajeehagul",                   uid: 483 },
  { id: 84,  name: "Muhammad Osama",               uid: 481 },
  { id: 85,  name: "Dur e Kashaf",                 uid: 479 },
  { id: 86,  name: "Ali Akbar",                    uid: 477 },
  { id: 87,  name: "Basma",                        uid: 465 },
  { id: 88,  name: "Bilal Khalid",                 uid: 456 },
  { id: 89,  name: "Fakeha Ahmed",                 uid: 454 },
  { id: 90,  name: "Ahrar Amin",                   uid: 448 },
  { id: 91,  name: "Neha HASAN",                   uid: 429 },
  { id: 92,  name: "Faiza Khalid",                 uid: 421 },
  { id: 93,  name: "Asia Ashraf",                  uid: 415 },
  { id: 94,  name: "Maliha Rafi Khan",             uid: 408 },
  { id: 95,  name: "baigmirzasinan",               uid: 405 },
  { id: 96,  name: "SapnaN",                       uid: 401 },
  { id: 97,  name: "SherineAazer",                 uid: 397 },
  { id: 98,  name: "Muhammad Ebraheem",            uid: 396 },
  { id: 99,  name: "Muniba Khan",                  uid: 386 },
  { id: 100, name: "Muhammad Hassan Khan",         uid: 385 },
  { id: 101, name: "FAISALMASOOD",                 uid: 383 },
  { id: 102, name: "Allaa Macharka",               uid: 380 },
  { id: 103, name: "JunaidAli",                    uid: 379 },
  { id: 104, name: "Ritesh Walecha",               uid: 378 },
  { id: 105, name: "Rabbia Mahboob",               uid: 377 },
  { id: 106, name: "Muhammad Haris Naeem Khokhar", uid: 376 },
  { id: 107, name: "Adnan Khurshid",               uid: 354 },
  { id: 108, name: "Saad Karim",                   uid: 312 },
  { id: 109, name: "Muhammad Sabir",               uid: 302 },
  { id: 110, name: "Shoaib",                       uid: 295 },
  { id: 111, name: "Faizan Ilahi",                 uid: 294 },
  { id: 112, name: "Dolan Rodrigues",              uid: 256 },
  { id: 113, name: "Lamia Amir",                   uid: 239 },
  { id: 114, name: "Malaika Arif",                 uid: 232 },
  { id: 115, name: "Ubaid Sheikh",                 uid: 231 },
  { id: 116, name: "Abdul Nazeem",                 uid: 227 },
  { id: 117, name: "Sabeen Fatima",                uid: 223 },
  { id: 118, name: "Azain Shaikh",                 uid: 218 },
  { id: 119, name: "Moazzam Malik",                uid: 215 },
  { id: 120, name: "Muhammad Waqas",               uid: 213 },
  { id: 121, name: "John Fernandes",               uid: 200 },
  { id: 122, name: "Shaizah Nasir",                uid: 190 },
  { id: 123, name: "Salman",                       uid: 185 },
  { id: 124, name: "Khwaja Yasin",                 uid: 175 },
  { id: 125, name: "Zeeshan Ahmed",                uid: 174 },
  { id: 126, name: "Saima Noor",                   uid: 172 },
  { id: 127, name: "Raheel Naseer",                uid: 154 },
  { id: 128, name: "Dr. Mahnoor Ashraf",           uid: 153 },
  { id: 129, name: "Sara Ali Omar",                uid: 142 },
  { id: 130, name: "Mahnoor Gul",                  uid: 141 },
  { id: 131, name: "Saif ul Hasan",                uid: 140 },
  { id: 132, name: "Mohamed Essam",                uid: 119 },
  { id: 133, name: "Uzma Shabbir",                 uid: 118 },
  { id: 134, name: "Ainiya Hafiz",                 uid: 114 },
  { id: 135, name: "Syed Zain Ali Akbar",          uid: 113 },
  { id: 136, name: "Irum Asif",                    uid: 112 },
  { id: 137, name: "Tayyaba Anwar",                uid: 111 },
  { id: 138, name: "Ayza Shahid",                  uid: 109 },
  { id: 139, name: "Adeena Yaqoob",                uid: 108 },
  { id: 140, name: "Sophia Abid",                  uid: 107 },
  { id: 141, name: "Hassam Umer",                  uid: 106 },
  { id: 142, name: "Sajjad Hameed",                uid: 105 },
  { id: 143, name: "Eesha Qureshi",                uid: 104 },
  { id: 144, name: "Farheen Nasim",                uid: 103 },
  { id: 145, name: "Nimra Nishat",                 uid: 99  },
  { id: 146, name: "Muhammad Umer Imran",          uid: 98  },
  { id: 147, name: "Afsheen Mohsin",               uid: 97  },
  { id: 148, name: "Meher Gul",                    uid: 96  },
  { id: 149, name: "Sajida Karimi",                uid: 93  },
  { id: 150, name: "Subhan Shabbir Tinwala",       uid: 92  },
  { id: 151, name: "Sadaf Yousuf",                 uid: 91  },
  { id: 152, name: "Rizwan Anwer",                 uid: 90  },
  { id: 153, name: "Sara Jawaid",                  uid: 89  },
  { id: 154, name: "Syed Muhammad Dilawaiz Shafi", uid: 70  },
  { id: 155, name: "Rafay Mansoor",                uid: 69  },
  { id: 156, name: "Uroosha Sabir",                uid: 68  },
  { id: 157, name: "Abdur Rehman Imran",           uid: 67  },
  { id: 158, name: "Vivek Madan",                  uid: 66  },
  { id: 159, name: "Sana Ahmed",                   uid: 65  },
  { id: 160, name: "Saghar Muhammad",              uid: 64  },
  { id: 161, name: "Samina Kausar",                uid: 63  },
  { id: 162, name: "Shoaib Ghani",                 uid: 62  },
  { id: 163, name: "Muhammed Ahmed",               uid: 61  },
  { id: 164, name: "Summaiya Saleem",              uid: 60  },
  { id: 165, name: "murtaza",                      uid: 48  },
  { id: 166, name: "Afroze Zaidi",                 uid: 46  },
  { id: 167, name: "ahmed",                        uid: 31  },
  { id: 168, name: "Taha Shahid",                  uid: 18  },
  { id: 169, name: "Ahmed Shaheer",                uid: 11  },
  { id: 170, name: "Mirza Sinan Baig",             uid: 6   },
  { id: 171, name: "Syed Ahmer Hussain",           uid: 4   },
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
  "Sports Science", "Meteorology", "Earth Sciences", "Astronomy",
  "Marine Biology", "Genetics", "Bio Technology", "Cyber Security",
  "Data Sciences", "Artificial Intelligence", "Robotics", "Linguistics",
  "Ethics", "Anthropology", "Theatre", "Film Studies", "Media Studies",
  "Journalism", "Digital Marketing", "Web Design", "Graphic Design",
  "Architecture", "Pharmacy", "Nursing", "Medicine", "Law",
  "European History", "UK History", "US History", "World History",
  "Modern History", "Ancient History", "History",
  "Japanese", "Mandarin", "Chinese Mandarin",
  "Arabic as first language", "Arabic as second language",
  "Italian", "German", "French", "Spanish", "Hindi", "Urdu", "Islamiyat",
  "Combined Science", "Environmental Science", "Environmental Management",
  "Creative Writing", "Literature", "English Literature",
  "Accounting", "Managerial Accounting", "Commerce",
  "Art", "Music", "Drama", "Physical Education",
  "Trigonometry", "Geometry", "Calculus", "Algebra", "Mechanics",
  "Additional Mathematics",
  "Information Technology (IT)",
  "Sociology", "Philosophy", "Political Science", "Engineering",
  "Science", "IELTS", "Geography", "Humanities",
  "Global Perspectives", "Travel & Tourism",
];

export const POUR_CATS = [
  "Video", "Interaction", "Technical", "Cancellation",
  "Resources", "Time", "No Show",
];

// Student's grade/year within the program — distinct from `level`
// (which is the qualification like IGCSE / A-Level / IB).
export const GRADES = [
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
  "Grade 13",
];

export const TEACHER_TIERS = [
  "Tier 01", "Tier 02", "Tier 03", "Tier 04", "Tier 05",
] as const;

export const ACCT_TYPES = ["Sales", "Product", "Consumer"];

// Product-analyst finalisation palette. DB values match ACCT_TYPES; the
// display label for "Consumer" is "Consumer Issue" per product decision.
export const ACCT_FINAL_CATEGORIES: readonly { value: string; label: string }[] = [
  { value: "Product",  label: "Product" },
  { value: "Sales",    label: "Sales" },
  { value: "Consumer", label: "Consumer Issue" },
] as const;

export function acctFinalLabel(value: string): string {
  return ACCT_FINAL_CATEGORIES.find(c => c.value === value)?.label ?? value;
}

// ─── PRODUCT REVIEW WORKFLOW — ENROLLMENTS & SESSIONS ───

export interface Enrollment {
  id: number;
  enrollmentId: string;
  teacherId: string;
  studentId: string;
  teacherName: string;
  studentName: string;
  subject: string;
  grade: string;
  board: string;
  curriculum: string;
  sessionHourlyRate: number | null;
  tutorHourlyRate: number | null;
  enrollmentStatus: string;
  consumerType: string;
  pauseStarts: string | null;
  pauseEnds: string | null;
  isPermanent: boolean;
  actionBy: string;
  additionalNotes: string;
  logId: number | null;
  logCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SessionProcessingStatus =
  | "pending"
  | "processing"
  | "scored"
  | "approved"
  | "failed";

export interface Session {
  id: number;
  sessionId: string;
  enrollmentId: string;
  scheduledTime: string | null;
  tutorName: string;
  expectedStudent1: string;
  expectedStudent2: string;
  subject: string;
  board: string;
  grade: string;
  curriculum: string;
  enrollmentName: string;
  tutorClassTime: number | null;
  tutorScaledClassTime: number | null;
  classScheduledDuration: number | null;
  student1ClassTime: number | null;
  student2ClassTime: number | null;
  sessionDate: string | null;
  classStatus: string;
  notes: string;
  attendedStudent1: boolean | null;
  attendedStudent2: boolean | null;
  teacherTransaction1: string;
  studentTransaction1: string;
  studentTransaction2: string;
  recordingLink: string;
  transcript: string | null;
  processingStatus: SessionProcessingStatus;
  teacherUserId: string | null;
  teacherUserName: string | null;
  studentUserId: string | null;
  studentUserName: string | null;
  createdAt: string;
  updatedAt: string;
}

// A Session + its approved scorecard draft, joined for teacher/student profiles.
export interface ApprovedSession extends Session {
  scorecardTotal: number;
  scoreInterpretation: string;
  pourIssues: { category: string; description: string }[];
  overallSummary: string;
  improvementSuggestions: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  approvalRate: number | null;
  rawDraftData: DraftData;
  draftStatus: DemoDraftStatus;
}

// A Session + (optional) draft — superset of ApprovedSession. Powers the
// /teachers Product log so every session surfaces, not only approved ones.
// Scorecard fields are null until the analyst pipeline populates them.
export interface TeacherSession extends Session {
  scorecardTotal: number | null;
  scoreInterpretation: string | null;
  pourIssues: { category: string; description: string }[];
  overallSummary: string | null;
  improvementSuggestions: string | null;
  reviewedAt: string | null;
  draftStatus: DemoDraftStatus | null;
}

export interface SessionDraft {
  id: string;
  session_id: number;
  agent_name: string;
  draft_data: DraftData;
  status: DemoDraftStatus;
  approval_rate: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}
