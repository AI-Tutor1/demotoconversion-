/**
 * DB row ↔ camelCase transforms for teacher_profiles, teacher_rates,
 * teacher_availability, hr_interview_drafts. Mirrors review-transforms.ts.
 */

import type {
  InterviewRubric,
  TeacherAvailabilitySlot,
  TeacherInterviewDraft,
  TeacherInterviewDraftStatus,
  TeacherProfile,
  TeacherProfileStatus,
  TeacherRate,
  TeachingMatrixEntry,
} from "@/lib/types";

// ─── teacher_profiles ────────────────────────────────────────

interface TeacherProfileRow {
  id: string;
  hr_application_number: string;
  phone_number: string;
  email: string | null;
  first_name: string;
  last_name: string;
  cv_link: string | null;
  qualification: string | null;
  subjects_interested: string[] | null;
  teaching_matrix: TeachingMatrixEntry[] | null;
  interview_recording_link: string | null;
  interview_notes: string | null;
  interview_rubric: InterviewRubric | null;
  status: TeacherProfileStatus;
  tid: number | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  reject_reason: string | null;
  tier: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function dbRowToTeacherProfile(row: TeacherProfileRow): TeacherProfile {
  return {
    id: row.id,
    hrApplicationNumber: row.hr_application_number,
    phoneNumber: row.phone_number,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    cvLink: row.cv_link,
    qualification: row.qualification,
    subjectsInterested: row.subjects_interested ?? [],
    teachingMatrix: row.teaching_matrix ?? [],
    interviewRecordingLink: row.interview_recording_link,
    interviewNotes: row.interview_notes,
    interviewRubric: row.interview_rubric ?? {},
    status: row.status,
    tid: row.tid,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at,
    rejectedBy: row.rejected_by,
    rejectReason: row.reject_reason,
    tier: row.tier,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function teacherFullName(p: Pick<TeacherProfile, "firstName" | "lastName">): string {
  const last = (p.lastName ?? "").trim();
  const first = (p.firstName ?? "").trim();
  if (!last || last === "—") return first;
  return `${first} ${last}`;
}

// ─── teacher_rates ───────────────────────────────────────────

interface TeacherRateRow {
  id: string;
  teacher_profile_id: string;
  curriculum: string;
  level: string;
  grade: string;
  subject: string;
  rate_per_hour: number | string;   // NUMERIC comes back as string from postgrest
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function dbRowToTeacherRate(row: TeacherRateRow): TeacherRate {
  return {
    id: row.id,
    teacherProfileId: row.teacher_profile_id,
    curriculum: row.curriculum,
    level: row.level,
    grade: row.grade,
    subject: row.subject,
    ratePerHour: typeof row.rate_per_hour === "string" ? Number(row.rate_per_hour) : row.rate_per_hour,
    currency: row.currency,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── teacher_availability ────────────────────────────────────

interface TeacherAvailabilityRow {
  id: string;
  teacher_profile_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function dbRowToTeacherAvailability(row: TeacherAvailabilityRow): TeacherAvailabilitySlot {
  return {
    id: row.id,
    teacherProfileId: row.teacher_profile_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    timezone: row.timezone,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── hr_interview_drafts ─────────────────────────────────────

interface HrInterviewDraftRow {
  id: string;
  teacher_profile_id: string;
  transcript: string | null;
  agent_name: string;
  draft_data: Record<string, unknown>;
  status: TeacherInterviewDraftStatus;
  approval_rate: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export function dbRowToInterviewDraft(row: HrInterviewDraftRow): TeacherInterviewDraft {
  return {
    id: row.id,
    teacherProfileId: row.teacher_profile_id,
    transcript: row.transcript,
    agentName: row.agent_name,
    draftData: row.draft_data as TeacherInterviewDraft["draftData"],
    status: row.status,
    approvalRate: row.approval_rate,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}
