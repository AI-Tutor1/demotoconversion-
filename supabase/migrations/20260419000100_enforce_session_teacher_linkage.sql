-- ============================================================
-- Hard gate: every session MUST have teacher_user_id + non-empty
-- teacher_user_name after auto-populate, otherwise reject the row.
--
-- Runs AFTER populate_session_user_fields() (trg_populate_...) thanks
-- to alphabetical trigger ordering — the `zzz_` prefix guarantees we
-- fire last among BEFORE triggers, so the auto-populate has first
-- crack at filling the fields from enrollments.
--
-- Purpose: make it structurally impossible to land a session the UI
-- cannot link back to a teacher. The /teachers Product log joins by
-- teacher_user_id; a NULL here = session invisible on /teachers.
-- ============================================================

-- Sanity: how many existing rows would fail this gate right now?
-- Expected 0 per the 2026-04-19 audit; logged so any future reapply
-- shows the pre-existing state.
DO $sanity$
DECLARE orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
    FROM public.sessions
   WHERE teacher_user_id IS NULL
      OR teacher_user_name IS NULL
      OR TRIM(teacher_user_name) = '';
  RAISE NOTICE 'sessions violating teacher-linkage invariant before trigger install: %', orphan_count;
END
$sanity$;

CREATE OR REPLACE FUNCTION public.enforce_session_teacher_linkage()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.teacher_user_id IS NULL
     OR NEW.teacher_user_name IS NULL
     OR TRIM(NEW.teacher_user_name) = '' THEN
    RAISE EXCEPTION
      'session % cannot be linked to a teacher (enrollment %) — upload the enrollment first',
      NEW.session_id, NEW.enrollment_id
      USING ERRCODE = 'foreign_key_violation',
            HINT = 'Ensure public.enrollments has a row for this enrollment_id with a non-empty teacher_name before inserting the session.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS zzz_enforce_session_teacher_linkage ON public.sessions;
CREATE TRIGGER zzz_enforce_session_teacher_linkage
  BEFORE INSERT OR UPDATE OF teacher_user_id, teacher_user_name, enrollment_id
  ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_session_teacher_linkage();
