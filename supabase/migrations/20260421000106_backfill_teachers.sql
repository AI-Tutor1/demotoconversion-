-- ============================================================
-- Backfill existing 171 teachers into teacher_profiles as status='approved'
-- ============================================================
-- public.teachers is already seeded by 20260413000010_update_teachers_roster.sql
-- with the exact 171 rows that the frontend TEACHERS constant knows about.
-- We copy from that table (rather than re-embedding the VALUES list) so the
-- two stay in lockstep by construction.
--
-- Sentinels: hr_application_number='LEGACY-<uid>', phone_number='UNKNOWN-<uid>'.
-- HR/analyst/manager can fill real values in via the Edit button on
-- /teachers/[id] once the UI ships.
--
-- Name split rule: first word → first_name, rest → last_name. Single-word
-- names (e.g. 'Yashal', 'Basma') fall back to last_name='—' so NOT NULL
-- is satisfied.
-- ============================================================

INSERT INTO public.teacher_profiles (
  hr_application_number,
  phone_number,
  first_name,
  last_name,
  tid,
  status,
  approved_at,
  created_at
)
SELECT
  'LEGACY-' || uid::text,
  'UNKNOWN-' || uid::text,
  split_part(name, ' ', 1),
  CASE
    WHEN position(' ' IN name) = 0 THEN '—'
    ELSE trim(substring(name FROM position(' ' IN name) + 1))
  END,
  uid::bigint,
  'approved',
  NOW(),
  NOW()
FROM public.teachers
ON CONFLICT (hr_application_number) DO NOTHING;

-- Sanity: row count should match public.teachers after the backfill.
DO $$
DECLARE
  v_src   integer;
  v_dest  integer;
BEGIN
  SELECT count(*) INTO v_src  FROM public.teachers;
  SELECT count(*) INTO v_dest FROM public.teacher_profiles WHERE status='approved';
  IF v_dest < v_src THEN
    RAISE EXCEPTION 'Backfill mismatch: public.teachers=% approved_profiles=%', v_src, v_dest;
  END IF;
END
$$;
