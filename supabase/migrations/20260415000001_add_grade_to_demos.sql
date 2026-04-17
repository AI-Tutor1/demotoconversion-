-- Add `grade` column to demos: the student's year within the program
-- (e.g. "Grade 9", "Grade 10"). Distinct from `level` which is the
-- qualification (IGCSE / A-Level / IB / etc.). Defaults to '' so existing
-- rows remain valid; new rows must supply a value via the app's form
-- validation.

ALTER TABLE public.demos
  ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT '';
