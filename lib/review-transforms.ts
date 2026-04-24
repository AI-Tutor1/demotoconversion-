/**
 * DB row ↔ camelCase transforms for the Product Review workflow.
 * Follows the same pattern as lib/transforms.ts for demos.
 */

import type {
  ApprovedSession,
  DemoDraftStatus,
  DraftData,
  Enrollment,
  Session,
  TeacherSession,
} from "@/lib/types";

// ─── Enrollment DB row shape ────────────────────────────────
interface EnrollmentRow {
  id: number;
  enrollment_id: string;
  teacher_id: string;
  student_id: string;
  teacher_name: string;
  student_name: string;
  subject: string;
  grade: string;
  board: string;
  curriculum: string;
  session_hourly_rate: number | null;
  tutor_hourly_rate: number | null;
  enrollment_status: string;
  consumer_type: string;
  pause_starts: string | null;
  pause_ends: string | null;
  is_permanent: boolean;
  action_by: string;
  additional_notes: string;
  log_id: number | null;
  log_created_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Session DB row shape ───────────────────────────────────
interface SessionRow {
  id: number;
  session_id: string;
  enrollment_id: string;
  scheduled_time: string | null;
  tutor_name: string;
  expected_student_1: string;
  expected_student_2: string;
  subject: string;
  board: string;
  grade: string;
  curriculum: string;
  enrollment_name: string;
  tutor_class_time: number | null;
  tutor_scaled_class_time: number | null;
  class_scheduled_duration: number | null;
  student_1_class_time: number | null;
  student_2_class_time: number | null;
  session_date: string | null;
  class_status: string;
  notes: string;
  attended_student_1: boolean | null;
  attended_student_2: boolean | null;
  teacher_transaction_1: string;
  student_transaction_1: string;
  student_transaction_2: string;
  recording_link: string;
  transcript: string | null;
  processing_status: string;
  teacher_user_id: string | null;
  teacher_user_name: string | null;
  student_user_id: string | null;
  student_user_name: string | null;
  created_at: string;
  updated_at: string;
}

// Joined session + draft row returned from the approved-sessions query.
interface ApprovedSessionRow extends SessionRow {
  session_drafts: {
    draft_data: DraftData;
    status: DemoDraftStatus;
    reviewed_at: string | null;
    reviewed_by: string | null;
    approval_rate: number | null;
  }[];
}

export function dbRowToEnrollment(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    teacherId: row.teacher_id,
    studentId: row.student_id,
    teacherName: row.teacher_name,
    studentName: row.student_name,
    subject: row.subject ?? "",
    grade: row.grade ?? "",
    board: row.board ?? "",
    curriculum: row.curriculum ?? "",
    sessionHourlyRate: row.session_hourly_rate,
    tutorHourlyRate: row.tutor_hourly_rate,
    enrollmentStatus: row.enrollment_status ?? "",
    consumerType: row.consumer_type ?? "",
    pauseStarts: row.pause_starts,
    pauseEnds: row.pause_ends,
    isPermanent: row.is_permanent ?? false,
    actionBy: row.action_by ?? "",
    additionalNotes: row.additional_notes ?? "",
    logId: row.log_id,
    logCreatedAt: row.log_created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function dbRowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    sessionId: row.session_id,
    enrollmentId: row.enrollment_id,
    scheduledTime: row.scheduled_time,
    tutorName: row.tutor_name ?? "",
    expectedStudent1: row.expected_student_1 ?? "",
    expectedStudent2: row.expected_student_2 ?? "",
    subject: row.subject ?? "",
    board: row.board ?? "",
    grade: row.grade ?? "",
    curriculum: row.curriculum ?? "",
    enrollmentName: row.enrollment_name ?? "",
    tutorClassTime: row.tutor_class_time,
    tutorScaledClassTime: row.tutor_scaled_class_time,
    classScheduledDuration: row.class_scheduled_duration,
    student1ClassTime: row.student_1_class_time,
    student2ClassTime: row.student_2_class_time,
    sessionDate: row.session_date,
    classStatus: row.class_status ?? "",
    notes: row.notes ?? "",
    attendedStudent1: row.attended_student_1,
    attendedStudent2: row.attended_student_2,
    teacherTransaction1: row.teacher_transaction_1 ?? "",
    studentTransaction1: row.student_transaction_1 ?? "",
    studentTransaction2: row.student_transaction_2 ?? "",
    recordingLink: row.recording_link ?? "",
    transcript: row.transcript ?? null,
    processingStatus: (row.processing_status ?? "pending") as Session["processingStatus"],
    teacherUserId: row.teacher_user_id ?? null,
    teacherUserName: row.teacher_user_name ?? null,
    studentUserId: row.student_user_id ?? null,
    studentUserName: row.student_user_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Merge a session row with its approved draft into one flat record for /teachers + /students.
// Picks the most recent approved draft when multiple exist.
export function dbRowToApprovedSession(row: ApprovedSessionRow): ApprovedSession | null {
  const draft = row.session_drafts?.[0];
  if (!draft) return null;
  const base = dbRowToSession(row);
  return {
    ...base,
    scorecardTotal: draft.draft_data?.total_score ?? 0,
    scoreInterpretation: draft.draft_data?.score_interpretation ?? "",
    pourIssues: draft.draft_data?.pour_issues ?? [],
    overallSummary: draft.draft_data?.overall_summary ?? "",
    improvementSuggestions: draft.draft_data?.improvement_suggestions ?? "",
    reviewedAt: draft.reviewed_at,
    reviewedBy: draft.reviewed_by ?? null,
    approvalRate: draft.approval_rate ?? null,
    rawDraftData: draft.draft_data,
    draftStatus: draft.status,
  };
}

// Optional-draft counterpart of ApprovedSession — powers the /teachers
// Product log so every session surfaces (pending / processing / scored /
// approved / failed). Scorecard fields stay null until a draft exists.
type TeacherSessionRow = SessionRow & {
  session_drafts?: {
    draft_data: DraftData | null;
    status: DemoDraftStatus;
    reviewed_at: string | null;
  }[] | null;
};

export function dbRowToTeacherSession(row: TeacherSessionRow): TeacherSession {
  const draft = row.session_drafts?.[0] ?? null;
  const base = dbRowToSession(row);
  return {
    ...base,
    scorecardTotal: draft?.draft_data?.total_score ?? null,
    scoreInterpretation: draft?.draft_data?.score_interpretation ?? null,
    pourIssues: draft?.draft_data?.pour_issues ?? [],
    overallSummary: draft?.draft_data?.overall_summary ?? null,
    improvementSuggestions: draft?.draft_data?.improvement_suggestions ?? null,
    reviewedAt: draft?.reviewed_at ?? null,
    draftStatus: draft?.status ?? null,
  };
}
