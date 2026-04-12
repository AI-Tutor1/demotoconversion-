-- ============================================================
-- Demo to Conversion — Phase 2 Initial Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- users: linked to Supabase auth.users via UUID PK
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.users (
  id              UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT         UNIQUE NOT NULL,
  full_name       TEXT         NOT NULL,
  role            TEXT         NOT NULL CHECK (role IN ('analyst', 'sales_agent', 'manager')),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  max_capacity    INTEGER      NOT NULL DEFAULT 15,
  current_load    INTEGER      NOT NULL DEFAULT 0,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role_active ON public.users(role) WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────
-- teachers: static lookup (170 teachers in full production)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.teachers (
  id          INTEGER      PRIMARY KEY,
  name        TEXT         NOT NULL,
  uid         INTEGER      NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- demos: core pipeline record (V1 + V2 multi-user fields)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.demos (
  id                BIGSERIAL    PRIMARY KEY,

  -- V1 core fields (match frontend Demo type)
  date              DATE         NOT NULL,
  teacher           TEXT         NOT NULL,
  tid               INTEGER      NOT NULL,
  student           TEXT         NOT NULL,
  level             TEXT         NOT NULL,
  subject           TEXT         NOT NULL,
  review            TEXT         NOT NULL DEFAULT '',
  methodology       TEXT,
  engagement        TEXT,
  student_raw       INTEGER      NOT NULL DEFAULT 0 CHECK (student_raw BETWEEN 0 AND 10),
  student_rating_5  INTEGER      GENERATED ALWAYS AS (ROUND(student_raw / 2.0)::INTEGER) STORED,
  analyst_rating    INTEGER      NOT NULL DEFAULT 0 CHECK (analyst_rating BETWEEN 0 AND 5),
  status            TEXT         NOT NULL DEFAULT 'Pending'
                                 CHECK (status IN ('Pending', 'Converted', 'Not Converted')),
  suggestions       TEXT         NOT NULL DEFAULT '',
  improvement       TEXT,
  agent             TEXT         NOT NULL DEFAULT '',
  comments          TEXT         NOT NULL DEFAULT '',
  verbatim          TEXT         NOT NULL DEFAULT '',
  acct_type         TEXT         NOT NULL DEFAULT ''
                                 CHECK (acct_type IN ('', 'Sales', 'Product', 'Consumer')),
  link              TEXT         NOT NULL DEFAULT '',
  marketing         BOOLEAN      NOT NULL DEFAULT FALSE,
  ts                BIGINT       NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,

  -- V2 multi-user assignment fields
  analyst_id        UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  sales_agent_id    UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMPTZ,
  claimed_at        TIMESTAMPTZ,
  escalated_to      UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  escalated_at      TIMESTAMPTZ,
  workflow_stage    TEXT         NOT NULL DEFAULT 'new'
                                 CHECK (workflow_stage IN
                                   ('new', 'assigned', 'under_review',
                                    'pending_sales', 'contacted', 'converted', 'lost')),

  -- V2 AI fields (populated in Phase 3)
  transcript        TEXT,
  ai_draft_id       UUID,
  ai_approval_rate  FLOAT        CHECK (ai_approval_rate IS NULL OR ai_approval_rate BETWEEN 0 AND 1),

  -- Infrastructure
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demos_status          ON public.demos(status);
CREATE INDEX idx_demos_analyst         ON public.demos(analyst_id) WHERE analyst_id IS NOT NULL;
CREATE INDEX idx_demos_sales_agent     ON public.demos(sales_agent_id) WHERE sales_agent_id IS NOT NULL;
CREATE INDEX idx_demos_date            ON public.demos(date DESC);
CREATE INDEX idx_demos_workflow_stage  ON public.demos(workflow_stage);

-- Auto-bump updated_at on row update
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER demos_updated_at
  BEFORE UPDATE ON public.demos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- pour_issues: normalized from Demo.pour[] array
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.pour_issues (
  id           BIGSERIAL    PRIMARY KEY,
  demo_id      BIGINT       NOT NULL REFERENCES public.demos(id) ON DELETE CASCADE,
  category     TEXT         NOT NULL CHECK (category IN
                              ('Video', 'Interaction', 'Technical', 'Cancellation',
                               'Resources', 'Time', 'No Show')),
  description  TEXT         NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pour_demo      ON public.pour_issues(demo_id);
CREATE INDEX idx_pour_category  ON public.pour_issues(category);

-- ─────────────────────────────────────────────────────────────
-- demo_drafts: AI output before human approval (Phase 3)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.demo_drafts (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_id        BIGINT       NOT NULL REFERENCES public.demos(id) ON DELETE CASCADE,
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

CREATE INDEX idx_drafts_demo    ON public.demo_drafts(demo_id);
CREATE INDEX idx_drafts_status  ON public.demo_drafts(status);

-- ─────────────────────────────────────────────────────────────
-- agent_configs: manager-editable AI agent settings (Phase 3)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.agent_configs (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name     TEXT         UNIQUE NOT NULL,
  system_prompt  TEXT         NOT NULL,
  model          TEXT         NOT NULL,
  temperature    FLOAT        NOT NULL DEFAULT 0.7 CHECK (temperature BETWEEN 0 AND 1),
  is_enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
  max_retries    INTEGER      NOT NULL DEFAULT 3,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by     UUID         REFERENCES public.users(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────
-- task_queue: AI task execution log (Phase 3)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.task_queue (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_id        BIGINT       REFERENCES public.demos(id) ON DELETE CASCADE,
  agent_name     TEXT         NOT NULL,
  status         TEXT         NOT NULL DEFAULT 'queued'
                              CHECK (status IN
                                ('queued', 'running', 'completed', 'failed', 'retrying')),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  duration_ms    INTEGER,
  error_message  TEXT,
  retry_count    INTEGER      NOT NULL DEFAULT 0,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_status  ON public.task_queue(status);
CREATE INDEX idx_tasks_demo    ON public.task_queue(demo_id);
