-- Test-data fixup, run after migration 20260413000006.
-- (1) Assign EVERY remaining unassigned demo to the Sales User so the sales
--     queue has a full cross-stage dataset to work with, not just pending_sales.
UPDATE public.demos
   SET sales_agent_id = '8ff0688b-c15b-4e5e-87c0-03faa78eb6cf',
       agent = 'Sales User'
 WHERE sales_agent_id IS NULL;

-- (2) Flip Ahmed Khan (id 1) back to Pending / pending_sales so the AI
--     Analyze flow has a freshly-pending demo with a transcript to test.
UPDATE public.demos
   SET status = 'Pending',
       workflow_stage = 'pending_sales'
 WHERE id = 1;
