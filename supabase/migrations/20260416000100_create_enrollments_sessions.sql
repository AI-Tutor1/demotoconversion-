-- ============================================================
-- Product Review Workflow — Core Tables
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- enrollments: master LMS data uploaded via CSV
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.enrollments (
  id                   BIGSERIAL    PRIMARY KEY,
  enrollment_id        TEXT         UNIQUE NOT NULL,
  teacher_id           TEXT         NOT NULL,
  student_id           TEXT         NOT NULL,
  teacher_name         TEXT         NOT NULL,
  student_name         TEXT         NOT NULL,
  subject              TEXT         NOT NULL DEFAULT '',
  grade                TEXT         NOT NULL DEFAULT '',
  board                TEXT         NOT NULL DEFAULT '',
  curriculum           TEXT         NOT NULL DEFAULT '',
  session_hourly_rate  NUMERIC(10,2),
  tutor_hourly_rate    NUMERIC(10,2),
  enrollment_status    TEXT         NOT NULL DEFAULT '',
  consumer_type        TEXT         NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_enrollments_enrollment_id ON public.enrollments(enrollment_id);
CREATE INDEX idx_enrollments_teacher_name  ON public.enrollments(teacher_name);
CREATE INDEX idx_enrollments_student_name  ON public.enrollments(student_name);
CREATE INDEX idx_enrollments_status        ON public.enrollments(enrollment_status);

CREATE TRIGGER enrollments_updated_at
  BEFORE UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- sessions: daily session records uploaded via CSV
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.sessions (
  id                       BIGSERIAL    PRIMARY KEY,
  session_id               TEXT         UNIQUE NOT NULL,
  enrollment_id            TEXT         NOT NULL REFERENCES public.enrollments(enrollment_id),
  scheduled_time           TIMESTAMPTZ,
  tutor_name               TEXT         NOT NULL DEFAULT '',
  expected_student_1       TEXT         NOT NULL DEFAULT '',
  expected_student_2       TEXT         NOT NULL DEFAULT '',
  subject                  TEXT         NOT NULL DEFAULT '',
  board                    TEXT         NOT NULL DEFAULT '',
  grade                    TEXT         NOT NULL DEFAULT '',
  curriculum               TEXT         NOT NULL DEFAULT '',
  enrollment_name          TEXT         NOT NULL DEFAULT '',
  tutor_class_time         NUMERIC(10,2),
  tutor_scaled_class_time  NUMERIC(10,2),
  class_scheduled_duration NUMERIC(10,2),
  student_1_class_time     NUMERIC(10,2),
  student_2_class_time     NUMERIC(10,2),
  session_date             DATE,
  class_status             TEXT         NOT NULL DEFAULT '',
  notes                    TEXT         NOT NULL DEFAULT '',
  attended_student_1       BOOLEAN,
  attended_student_2       BOOLEAN,
  teacher_transaction_1    TEXT         NOT NULL DEFAULT '',
  student_transaction_1    TEXT         NOT NULL DEFAULT '',
  student_transaction_2    TEXT         NOT NULL DEFAULT '',
  recording_link           TEXT         NOT NULL DEFAULT '',
  transcript               TEXT,
  processing_status        TEXT         NOT NULL DEFAULT 'pending'
                           CHECK (processing_status IN
                             ('pending', 'processing', 'scored', 'approved', 'failed')),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_session_id      ON public.sessions(session_id);
CREATE INDEX idx_sessions_enrollment_id   ON public.sessions(enrollment_id);
CREATE INDEX idx_sessions_tutor_name      ON public.sessions(tutor_name);
CREATE INDEX idx_sessions_processing      ON public.sessions(processing_status);
CREATE INDEX idx_sessions_date            ON public.sessions(session_date DESC);

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- session_drafts: AI scorecard output (mirrors demo_drafts)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.session_drafts (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     BIGINT       NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  agent_name     TEXT         NOT NULL,
  draft_data     JSONB        NOT NULL,
  status         TEXT         NOT NULL DEFAULT 'pending_review'
                              CHECK (status IN
                                ('pending_review', 'approved', 'partially_edited', 'rejected')),
  approval_rate  FLOAT        CHECK (approval_rate IS NULL OR approval_rate BETWEEN 0 AND 1),
  reviewed_by    UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_drafts_session ON public.session_drafts(session_id);
CREATE INDEX idx_session_drafts_status  ON public.session_drafts(status);
