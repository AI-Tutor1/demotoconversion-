-- Structured review dimensions for the Demo Analyst agent output.
-- Previously we concatenated topic/resources/effectiveness into `review`;
-- now each gets its own column so Phase 3 analytics + Teacher Coach agent
-- can aggregate over them independently.
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS topic_review         TEXT NOT NULL DEFAULT '';
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS resources_review     TEXT NOT NULL DEFAULT '';
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS effectiveness_review TEXT NOT NULL DEFAULT '';
