#!/usr/bin/env bash
# seed-dev-users.sh — create the three dev seed users with passwords from env.
#
# Usage:
#   MANAGER_PWD=secret1 ANALYST_PWD=secret2 SALES_PWD=secret3 \
#     DATABASE_URL=postgresql://... ./scripts/seed-dev-users.sh
#
# Required env vars:
#   MANAGER_PWD   — password for manager@demo.pk
#   ANALYST_PWD   — password for analyst@demo.pk
#   SALES_PWD     — password for sales@demo.pk
#   DATABASE_URL  — postgres connection string (with superuser/service role)
#
# The script injects app.allow_dev_seed + per-role passwords as session settings
# so the migration guard passes, then re-runs the seed DO block inline.
# It does NOT re-apply the full migration file (which is already recorded in
# supabase_migrations.schema_migrations).

set -euo pipefail

# ── Validate required env vars ────────────────────────────────────────────────
: "${MANAGER_PWD:?MANAGER_PWD is required (password for manager@demo.pk)}"
: "${ANALYST_PWD:?ANALYST_PWD is required (password for analyst@demo.pk)}"
: "${SALES_PWD:?SALES_PWD is required (password for sales@demo.pk)}"
: "${DATABASE_URL:?DATABASE_URL is required (postgres connection string)}"

echo "[seed-dev-users] Seeding 3 dev users…"

psql "$DATABASE_URL" <<SQL
SET app.allow_dev_seed = 'true';
SET app.manager_pwd    = '${MANAGER_PWD}';
SET app.analyst_pwd    = '${ANALYST_PWD}';
SET app.sales_pwd      = '${SALES_PWD}';

DO \$\$
DECLARE
  v_manager_id UUID := gen_random_uuid();
  v_analyst_id UUID := gen_random_uuid();
  v_sales_id   UUID := gen_random_uuid();
  v_manager_pwd TEXT := current_setting('app.manager_pwd', false);
  v_analyst_pwd TEXT := current_setting('app.analyst_pwd', false);
  v_sales_pwd   TEXT := current_setting('app.sales_pwd',   false);
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', v_manager_id, 'authenticated', 'authenticated',
     'manager@demo.pk', crypt(v_manager_pwd, gen_salt('bf')), NOW(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Manager User"}'::jsonb,
     NOW(), NOW(), FALSE, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_analyst_id, 'authenticated', 'authenticated',
     'analyst@demo.pk', crypt(v_analyst_pwd, gen_salt('bf')), NOW(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Analyst User"}'::jsonb,
     NOW(), NOW(), FALSE, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_sales_id, 'authenticated', 'authenticated',
     'sales@demo.pk',   crypt(v_sales_pwd, gen_salt('bf')), NOW(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Sales User"}'::jsonb,
     NOW(), NOW(), FALSE, '', '', '', '');

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

  INSERT INTO public.users (id, email, full_name, role, max_capacity) VALUES
    (v_manager_id, 'manager@demo.pk', 'Manager User', 'manager',     100),
    (v_analyst_id, 'analyst@demo.pk', 'Analyst User', 'analyst',      15),
    (v_sales_id,   'sales@demo.pk',   'Sales User',   'sales_agent',  20);

  RAISE NOTICE 'Seed users created: manager@demo.pk, analyst@demo.pk, sales@demo.pk';
END \$\$;
SQL

echo "[seed-dev-users] Done."
