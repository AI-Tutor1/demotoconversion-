# Deploy Guide

**Targets**: Vercel (Next.js frontend) + Render (FastAPI backend). Supabase is already hosted — no DB deploy.

**End state**: `https://<project>.vercel.app` → talks to `https://<project>-backend.onrender.com` → talks to Supabase.

Total time: **~30 minutes** if you follow the order.

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

- **Every push to `main`** → both Vercel and Render auto-redeploy. No action needed.
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
