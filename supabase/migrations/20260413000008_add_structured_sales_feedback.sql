-- 13 structured sales-feedback fields collected by the sales agent during follow-up.
-- Replaces the freeform `comments` / `verbatim` UX with 8 specific questions.
-- Booleans are nullable so "not answered" is distinguishable from explicit Yes/No.

ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_rating                 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_explanation            BOOLEAN;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_explanation_comment    TEXT NOT NULL DEFAULT '';
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_participation          BOOLEAN;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_participation_comment  TEXT NOT NULL DEFAULT '';
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_confused               BOOLEAN;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_confused_detail        TEXT NOT NULL DEFAULT '';
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_uncomfortable          BOOLEAN;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_uncomfortable_detail   TEXT NOT NULL DEFAULT '';
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_positive_env           BOOLEAN;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_positive_env_comment   TEXT NOT NULL DEFAULT '';
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_suggestions            TEXT NOT NULL DEFAULT '';
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS feedback_comments               TEXT NOT NULL DEFAULT '';
