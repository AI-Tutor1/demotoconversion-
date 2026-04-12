-- ============================================================
-- Seed the 3 initial users (dev/testing accounts)
-- ============================================================
-- TODO: PRODUCTION — rotate all dev passwords before launch,
-- then enable Supabase's HaveIBeenPwned leak-protection advisor.
-- ------------------------------------------------------------
-- Default password: ChangeMe123!  (rotate before production)
-- Creates rows in auth.users + auth.identities + public.users atomically.
-- UUIDs are generated once and reused across all three tables.
-- ============================================================

DO $$
DECLARE
  v_manager_id UUID := gen_random_uuid();
  v_analyst_id UUID := gen_random_uuid();
  v_sales_id   UUID := gen_random_uuid();
  v_password   TEXT := 'ChangeMe123!';
BEGIN
  -- ─── auth.users ────────────────────────────────────────────
  -- NOTE: confirmation_token / recovery_token / email_change / email_change_token_new
  -- must be '' (not NULL) — GoTrue aggregates them during sign-in and raw-SQL
  -- INSERTs that leave them NULL cause "Database error querying schema" on login.
  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', v_manager_id, 'authenticated', 'authenticated',
     'manager@demo.pk', crypt(v_password, gen_salt('bf')), NOW(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Manager User"}'::jsonb,
     NOW(), NOW(), FALSE,
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_analyst_id, 'authenticated', 'authenticated',
     'analyst@demo.pk', crypt(v_password, gen_salt('bf')), NOW(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Analyst User"}'::jsonb,
     NOW(), NOW(), FALSE,
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_sales_id, 'authenticated', 'authenticated',
     'sales@demo.pk',   crypt(v_password, gen_salt('bf')), NOW(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Sales User"}'::jsonb,
     NOW(), NOW(), FALSE,
     '', '', '', '');

  -- ─── auth.identities (required for email/password login) ───
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES
    (v_manager_id::text, v_manager_id,
     jsonb_build_object('sub', v_manager_id::text, 'email', 'manager@demo.pk',
                        'email_verified', true, 'phone_verified', false),
     'email', NOW(), NOW(), NOW()),
    (v_analyst_id::text, v_analyst_id,
     jsonb_build_object('sub', v_analyst_id::text, 'email', 'analyst@demo.pk',
                        'email_verified', true, 'phone_verified', false),
     'email', NOW(), NOW(), NOW()),
    (v_sales_id::text,   v_sales_id,
     jsonb_build_object('sub', v_sales_id::text,   'email', 'sales@demo.pk',
                        'email_verified', true, 'phone_verified', false),
     'email', NOW(), NOW(), NOW());

  -- ─── public.users (role profiles) ──────────────────────────
  INSERT INTO public.users (id, email, full_name, role, max_capacity) VALUES
    (v_manager_id, 'manager@demo.pk', 'Manager User', 'manager',     100),
    (v_analyst_id, 'analyst@demo.pk', 'Analyst User', 'analyst',      15),
    (v_sales_id,   'sales@demo.pk',   'Sales User',   'sales_agent',  20);
END $$;
