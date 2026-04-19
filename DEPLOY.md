# Deploy Guide

## Production today — VPS (Hostinger / Ubuntu 24.04)

Production lives at **`https://product.talimatedu.com`**, served from a single Ubuntu VPS fronted by **nginx**, with both the Next.js frontend and the FastAPI backend managed by **pm2**. Supabase is shared between local dev and prod.

```
Browser
  │   https://product.talimatedu.com
  ▼
nginx (Ubuntu 24.04, root:root)
  ├─► pm2 process "frontend"  → next start on :3000   (cwd /var/www/app)
  └─► pm2 process "backend"   → uvicorn on :8000      (cwd /var/www/app/backend)
       │
       ▼
  Supabase (shared with local dev)
```

**Box**: `root@72.61.195.234` (password auth; no SSH key installed on the Mac today — save the password in your password manager).

**Hostname**: `srv1529089`.

### Deploy a change (frontend)

Every deploy is manual. There is **no webhook** between GitHub and the VPS — pushing to `main` does not update prod on its own. After `git push origin main`:

```bash
# From your Mac
ssh root@72.61.195.234

# On the VPS
cd /var/www/app
git pull origin main
npm install           # near-instant if package.json unchanged
npm run build         # ~60–120s; ✓ Compiled successfully must appear
pm2 restart frontend
sleep 3
pm2 logs frontend --lines 40 --nostream
exit
```

Confirm from your Mac:

```bash
# /login ETag doesn't change for static routes you didn't edit —
# probe a bundle hash from the build output instead:
curl -s https://product.talimatedu.com/login | grep -oE '_next/static/chunks/[a-z0-9-]+\.js' | sort -u
# The chunk names must match the hashes printed in `npm run build`.
```

### Environment variables — auto-retry scheduler (2026-04-19)

Five optional keys tune the failed-session auto-retry in [backend/app/scheduler.py](backend/app/scheduler.py). All have sane defaults in `config.py`; only set them on the VPS when you need runtime tuning:

```
# .env on the VPS — append these to the existing Groq/Supabase block
AUTO_RETRY_ENABLED=true                    # master kill switch
AUTO_RETRY_INTERVAL_MINUTES=15             # tick frequency
AUTO_RETRY_MAX_ATTEMPTS=3                  # total failed rows per session
AUTO_RETRY_RATE_LIMIT_BACKOFF_MINUTES=60   # after ASPH/429 — keep ≥ 60
AUTO_RETRY_GENERIC_BACKOFF_MINUTES=5       # after any other transient
```

**IMPORTANT on the first deploy of this feature:** `APScheduler` is a new Python dependency. The backend deploy block MUST include the pip-install step this time (not skippable):

```bash
cd /var/www/app/backend
source <venv>/bin/activate && pip install -r requirements.txt && deactivate
pm2 restart backend
```

Confirm the scheduler is live in `pm2 logs backend`:

```
auto_retry: scheduler started, interval=15 min, enabled=True, max_attempts=3
```

Subsequent deploys that don't change `requirements.txt` can skip pip-install, same as before.

### Deploy a change (backend)

The backend Python venv path on this VPS isn't `.venv` — pm2 manages the backend through a bash wrapper. On 2026-04-19 the activate-venv step in a deploy failed with `-bash: .venv/bin/activate: No such file or directory`, but the pm2 restart still picked up the new code (no new deps to install), so it was a no-op annoyance, not a breakage. When backend has NEW Python deps, find the venv before pip-installing:

```bash
ssh root@72.61.195.234
cd /var/www/app/backend
# Pull (if frontend block didn't already):
git pull origin main

# Find the real venv (only needed when requirements.txt changed):
find /var/www/app /root -maxdepth 4 -name 'activate' -path '*bin*' 2>/dev/null
# Typical output: /var/www/app/backend/venv/bin/activate (or similar)
# Then, using that path:
#   source /var/www/app/backend/venv/bin/activate
#   pip install -r requirements.txt
#   deactivate

# Restart either way:
pm2 restart backend
pm2 logs backend --lines 40 --nostream
exit
```

When there are **no new Python deps** (the common case for a pure-logic fix), just `pm2 restart backend` — pm2 re-execs the existing wrapper and the restart picks up the new `.py` files.

### Migrations

Apply to Supabase **before** the `npm run build` step — the frontend assumes the new schema the moment it boots. Use the Supabase MCP `apply_migration` tool (from this repo's Claude sessions) or the Supabase dashboard SQL editor. Verify with `execute_sql` probes. Full rule: CLAUDE.md § "Before You Deploy" and `memory/feedback_local_before_domain.md`.

### When it breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm run build` fails on a TypeScript error | VPS Node version ≠ local | Check `node --version` on the VPS; match locally before trying again |
| `pm2 restart frontend` restarts but page still shows old code | Browser cached aggressively (nginx sets `s-maxage=31536000`) | Hard-refresh in browser; CDN cache may take a minute |
| `Failed to find Server Action "x"` in `pm2 logs` | A browser held a stale Server Action ID through the rebuild | Cosmetic — that tab reloads and the error stops |
| `502 Bad Gateway` at the domain | One of the pm2 processes crashed | `pm2 logs` to identify; `pm2 restart <name>` |
| New migration applied but frontend still reads old columns | Vercel/CDN cache | Hard-refresh; if persistent, `pm2 restart frontend` to evict next's in-memory query plan |

---

## Historical: Vercel + Render (not in use)

The Vercel (frontend) + Render (FastAPI) path below is the ORIGINAL deploy target documented by commit `887d65f`. It has been superseded by the VPS. Keep for reference — **do not use unless you're provisioning a fresh deploy and intentionally abandoning the VPS**. If you do switch back, update the §Production today section above in the same commit.

---

## 🚦 Pre-deploy gate — NEVER skip

Before pushing any change to Vercel / Render / the production domain, **every single change MUST pass on `http://localhost:3000` first**. No exceptions.

Run this loop on every change, in order:

1. **Supabase** — all migrations in `supabase/migrations/` are applied to the production project. Check with:
   ```bash
   # From supabase dashboard or via MCP list_migrations — on-disk files must match applied migrations
   ls supabase/migrations/ | sort
   ```
   If an on-disk migration isn't applied, the frontend will 404 at runtime (see CLAUDE.md "Deploy Contract"). Apply it before you push.

2. **Smoke** — `./scripts/smoke.sh` ends with `✅ smoke passed`. This gates Four Laws + `npm run build` + RPC manifest + backend contract.

3. **Local dev server** — `npm run dev` on :3000. **Visually walk the affected pages as each relevant role** (analyst / manager / sales). Confirm:
   - The change renders without errors in the browser console.
   - Role-gated behavior matches expectations (tabs hidden, RPCs blocked, redirects correct).
   - Any new realtime subscription propagates between two tabs within ~2s.
   - Edge / negative cases you think of — missing data, wrong role, typo'd inputs — don't crash.

4. **Only after 1–3 pass** — push to `main`. Vercel + Render auto-redeploy.

**Why this rule exists.** Build-green ≠ prod-ready (see MEMORY.md `feedback_never_ship_unverified_integration.md`). The smoke script catches static issues; it does not catch RLS gaps, a missing card on a drill-down page, a component that assumes a role, or a realtime channel that isn't wired. Only the browser at :3000 catches those.

**Violations have cost us production time before.** Do not deploy on trust.

---

## ⚠️ One critical decision before you start

Render's **free tier sleeps after 15 min of inactivity**. A session ingest (download + Whisper + analyst) can take **5–15 min end-to-end** as a FastAPI background task. If the backend sleeps with an ingest in flight, that ingest **dies**, the session is left in `processing`, and only a manual Retry click will recover it.

Two options:
1. **Ship on free first** → smoke test the deploy → upgrade to Starter ($7/mo) before any real traffic.
2. **Skip free entirely** → start on Starter.

I've left [`backend/render.yaml`](backend/render.yaml) on `plan: free` because you haven't added a card yet. Change it to `plan: starter` and push when you're ready.

---

## Prerequisites

1. GitHub account, repo pushed.
2. [Vercel account](https://vercel.com/signup) connected to your GitHub (free).
3. [Render account](https://render.com/register) connected to your GitHub (free).
4. Your existing secrets handy: Groq API key, Supabase URL, Supabase service-role key, Supabase anon key.

---

## Step 1 — Deploy the backend first

Why first: the frontend needs the backend URL as an env var.

### 1a. Connect repo to Render as a Blueprint
1. Render dashboard → **New** → **Blueprint**
2. Connect GitHub → pick your repo.
3. Render auto-detects [`backend/render.yaml`](backend/render.yaml) and offers to create the service.
4. Click **Apply**.

### 1b. Set secrets
The Blueprint creates the service with empty secrets. Fill them in:

Render → your service → **Environment** tab → set:

| Key | Value |
|---|---|
| `GROQ_API_KEY` | `gsk_…` from [Groq console](https://console.groq.com/keys) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` (same as your local) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key from Supabase → Settings → API |
| `FRONTEND_ORIGINS` | `http://localhost:3000` for now — update in Step 3 |

Click **Save, rebuild**. Wait ~3 min for the first Docker build (ffmpeg install takes the longest).

### 1c. Verify
Once the service shows **Live**, copy the URL (looks like `https://demo-to-conversion-backend.onrender.com`).

```bash
curl https://demo-to-conversion-backend.onrender.com/health
# → {"status":"ok"}
```

If this returns 200, the backend is up. If it's a 502 or hangs, check Render → Logs.

---

## Step 2 — Deploy the frontend

### 2a. Connect repo to Vercel
1. Vercel dashboard → **Add New** → **Project**.
2. Pick your GitHub repo.
3. Vercel auto-detects Next.js. Leave the defaults (Framework: Next.js, Build Command: `next build`, Output: `.next`).

### 2b. Set env vars (BEFORE first deploy)
In the "Environment Variables" section of the import screen, add:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (the long public JWT) |
| `NEXT_PUBLIC_AI_BACKEND_URL` | The Render URL from Step 1c, e.g. `https://demo-to-conversion-backend.onrender.com` |

Apply to: **Production**, **Preview**, **Development** (tick all three).

### 2c. Deploy
Click **Deploy**. Wait ~2 min. Vercel gives you a URL like `https://demo-to-conversion.vercel.app`.

---

## Step 3 — Wire CORS

Right now the backend allows `http://localhost:3000` + any `*.vercel.app` (via the regex in [`backend/app/main.py`](backend/app/main.py)). Your Vercel production URL is already covered by the regex, so **nothing to do** unless you use a custom domain.

If you add a custom domain later:
1. Render → service → Environment → edit `FRONTEND_ORIGINS` → add your domain:
   ```
   http://localhost:3000,https://app.yourdomain.com
   ```
2. Save → Render auto-redeploys.

---

## Step 4 — Smoke test

Open your Vercel URL in a browser.

Golden-path checklist:
1. **Login** with `analyst@demo.pk` → lands on dashboard.
2. **/sessions** → shows existing sessions with correct statuses.
3. Click a session → detail page renders, scorecard visible.
4. **/enrollments** → page loads, Upload CSV button works.
5. **Analyst trigger**: upload a new sessions CSV with a recording link, click "Process Pending". Watch a session flip `pending → processing → scored` in under 2 min.

If anything 500s: Render → Logs tab (live backend errors), Vercel → Deployments → click the latest → **Runtime Logs** (live frontend errors).

---

## Ongoing

- **Every push to `main`** → both Vercel and Render auto-redeploy. **But the pre-deploy gate above must pass on :3000 first.** Auto-deploy is not a substitute for local verification.
- **Secrets rotation**: update in Render and Vercel UIs separately. Neither reads from the repo.
- **Custom domain**: add on Vercel first (they issue a TLS cert via Let's Encrypt), then update `FRONTEND_ORIGINS` on Render.
- **Promoting to Starter**: Render → service → Settings → Instance Type → Starter. No code change needed.

## When it breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend loads, but every action 500s | `NEXT_PUBLIC_AI_BACKEND_URL` wrong | Vercel → Env → check → redeploy |
| `Failed to fetch` in browser console when clicking Process | CORS blocked | Render → Env → set `FRONTEND_ORIGINS` to your Vercel URL |
| `Not authenticated` inside a pipeline call | Supabase JWT expired / JWKS mismatch | Log out + back in. If still broken, verify `SUPABASE_URL` matches between frontend and backend |
| Sessions stuck `pending` forever after free-tier sleep | Render free tier killed background task | Click Retry on the session, or upgrade to Starter |
| First request after 15min idle is slow | Render free tier cold boot (~30s) | Cosmetic — upgrade to Starter to eliminate |
| `Package ffmpeg not found` in Render build logs | Docker not being used | Confirm `rootDir: backend` and `runtime: docker` in render.yaml |
