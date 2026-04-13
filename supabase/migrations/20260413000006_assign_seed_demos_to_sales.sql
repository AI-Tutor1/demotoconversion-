-- Backfill: assign all unassigned pending_sales demos to the Sales User so
-- the sales queue is non-empty out of the box. Fresh installs will run this
-- after the seed migrations; subsequent demo creation uses the frontend's
-- round-robin auto-assignment (analyst form, Fix 2).
UPDATE public.demos
   SET sales_agent_id = '8ff0688b-c15b-4e5e-87c0-03faa78eb6cf',
       agent = 'Sales User'
 WHERE sales_agent_id IS NULL
   AND workflow_stage = 'pending_sales';
