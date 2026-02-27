# Deploying Smart Document Filler on Render

This app runs as a **Render Web Service** (Next.js) plus a **Render Background Worker** (multi-agent pipeline). Supabase migrations must be applied to your Supabase project separately; Render does not run them.

## Prerequisites

- **Supabase project**: Created; run all migrations (e.g. `supabase db push` or run SQL from `supabase/migrations/` in the Supabase SQL editor).
- **Neo4j**: Aura or self-hosted instance; have connection URI, username, and password ready.
- **Gemini API key**: From [Google AI Studio](https://aistudio.google.com/).
- **Tavily API key**: From [Tavily](https://tavily.com/).
- **Git repo**: Code pushed to GitHub (or GitLab) so Render can connect and auto-deploy.

## Step-by-step deployment

1. **Log in** at [render.com](https://render.com) and connect your GitHub (or GitLab) account to the repository.

2. **Create a Blueprint** (recommended):
   - In the dashboard: **New** → **Blueprint**.
   - Connect the repo and choose the branch.
   - Render will detect `render.yaml` and create the **Web Service** and **Background Worker**.

3. **Set environment variables** for both services (or create one **Environment Group** and attach it to both):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DB_PASSWORD`
   - `GEMINI_API_KEY`
   - `NEO4J_URI` (e.g. `neo4j+s://xxxx.databases.neo4j.io`)
   - `NEO4J_USERNAME`
   - `NEO4J_PASSWORD`
   - `TAVILY_API_KEY`
   - `NODE_ENV` = `production`

4. **Deploy**: Let the first deploy run (build + start). Fix any build errors from the build log.

5. **Verify**:
   - Open `https://<your-web-service>.onrender.com/api/health`. You should see `supabase.ok`, `gemini`, and `neo4j` status.
   - Upload a document, run retrieval, then run an analysis job; confirm the worker processes the job and results (including the Tavily “External Vendor Risk Insights” section when vendors exist).

6. **Optional**: Create a Render **Environment Group** with the variables above and attach it to both the web and worker services so you only maintain env in one place.

## Architecture

- **Web Service**: Serves the Next.js UI and API routes (job creation, status, CSV download). No long-running Gemini/Neo4j/Tavily calls in request/response.
- **Background Worker**: Polls Supabase for pending ingestion, retrieval, and analysis jobs; runs the full pipeline (Retrieval → Extraction → Neo4j → Reasoning → Tavily → Execution) and writes results back to Supabase.

## Render build troubleshooting

- **NODE_ENV**: Next.js expects `NODE_ENV` to be `development` or `production`. In the Render dashboard, either leave `NODE_ENV` unset (Render sets it to `production` for builds) or set it explicitly to `production`. Do not use custom values (e.g. `staging`, `test`) for the build or you may see prerender/useContext errors.
- **If the web build still fails** (e.g. prerender/useContext errors): Use a clean install for reproducibility—e.g. set the web service build command to `npm ci && npm run build` and ensure `package-lock.json` is committed. This avoids duplicate or nested React from inconsistent installs.
