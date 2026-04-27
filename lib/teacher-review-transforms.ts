import type { TeacherReview, ReviewType, ReviewScope } from "./types";

export interface TeacherReviewRow {
  id: string;
  review_type: string;
  review_scope: string | null;
  review_date: string | null;
  teacher_user_id: string;
  teacher_user_name: string;
  enrollment_id: string | null;
  student_user_id: string | null;
  student_user_name: string | null;
  session_id: number | null;
  subject: string | null;
  grade: string | null;
  curriculum: string | null;
  board: string | null;
  overall_rating: number | null;
  summary: string | null;
  improvement_notes: string | null;
  student_verbatim: string | null;
  review_data: Record<string, { value: unknown; note?: string }> | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_role: string | null;
  created_at: string;
  updated_at: string;
}

export function dbRowToTeacherReview(r: TeacherReviewRow): TeacherReview {
  return {
    id: r.id,
    reviewType: r.review_type as ReviewType,
    reviewScope: ((r.review_scope ?? "enrollment") as ReviewScope),
    reviewDate: r.review_date ?? new Date().toISOString().slice(0, 10),
    teacherUserId: r.teacher_user_id,
    teacherUserName: r.teacher_user_name,
    enrollmentId: r.enrollment_id,
    studentUserId: r.student_user_id,
    studentUserName: r.student_user_name,
    sessionId: r.session_id,
    subject: r.subject ?? "",
    grade: r.grade ?? "",
    curriculum: r.curriculum ?? "",
    board: r.board ?? "",
    overallRating: r.overall_rating,
    summary: r.summary ?? "",
    improvementNotes: r.improvement_notes ?? "",
    studentVerbatim: r.student_verbatim ?? "",
    reviewData: r.review_data ?? {},
    createdBy: r.created_by,
    createdByName: r.created_by_name ?? "",
    createdByRole: r.created_by_role ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
