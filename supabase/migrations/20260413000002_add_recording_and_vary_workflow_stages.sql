-- ============================================================
-- Step 6 Issue 3 + Issue 4: recording URL + varied workflow stages
-- ============================================================

-- 1. New recording URL column (Step 1 of pipeline — Recording Retrieval)
ALTER TABLE public.demos
  ADD COLUMN IF NOT EXISTS recording TEXT NOT NULL DEFAULT '';

-- 2. Vary seed workflow_stages so Kanban has cards in every column.
--    Current: all 6 Pending demos have workflow_stage='new'.
--    Target: 2 new, 1 under_review, 3 pending_sales.

-- Keep as 'new' (2): Sara Ali (id 2), Alina Farooq (id 8)
-- Move to 'under_review' (1): Zara Malik (id 6)
UPDATE public.demos SET workflow_stage = 'under_review' WHERE id = 6;

-- Move to 'pending_sales' (3): Ahmed Khan (1), Layla Sheikh (5), Hassan Raza (7)
UPDATE public.demos SET workflow_stage = 'pending_sales' WHERE id IN (1, 5, 7);
