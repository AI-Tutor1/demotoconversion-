-- Add is_draft flag to demos.
-- Rows with is_draft = TRUE are sales-submitted demos awaiting analyst review.
-- They are excluded from Dashboard KPIs, Kanban, Analytics, and Teachers views.
-- On analyst approval the flag is flipped to FALSE via the app (setDemos update).

ALTER TABLE public.demos
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing rows are fully approved — keep them false (covered by DEFAULT FALSE).
-- Grant the sales_agent role permission to set is_draft on INSERT
-- (already covered by the widen_demos_insert_for_sales policy which allows all fields).
