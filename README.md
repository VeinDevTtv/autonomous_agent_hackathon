# Smart Document Filler

Smart Document Filler turns piles of invoices, contracts, and receipts into clear, organized summaries and reports. Upload your documents—the system reviews, compares, and highlights important details so you can spot what matters and take action with minimal effort.

**Demo scenario:** Upload 5 invoices and 1 contract, then ask: *"Summarize vendor totals, flag invoices over $5,000, compare contract liability clauses, and draft an email to accounting."* You get a table of totals, flagged anomalies, liability comparison, an email draft, and a downloadable CSV.

---

## Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS
- **Backend:** Next.js API routes (job creation, status, CSV download); no long-running AI/DB calls in request/response
- **AI:** Google Gemini (Pro for reasoning, Vision for OCR, Embeddings for semantic search)
- **Storage & auth:** Supabase (Auth, Storage, PostgreSQL + pgvector)
- **Graph:** Neo4j (entity graph: vendors, invoices, contracts, clauses, amounts)
- **Enrichment:** Tavily API (vendor risk / background research, cached in Supabase)
- **Deploy:** Render (Web Service + Background Worker)

---

## Run locally

1. **Clone and install**
   ```bash
   git clone https://github.com/VeinDevTtv/autonomous_agent_hackathon.git
   cd autonomous_agent_hackathon
   npm install
   ```

2. **Environment**
   - Copy `.env.example` to `.env` and fill in Supabase, Gemini, Neo4j, and Tavily keys (see [Environment variables](#environment-variables)).
   - Apply Supabase migrations (e.g. run SQL from `supabase/migrations/` in the Supabase SQL editor or use `supabase db push` if using Supabase CLI).

3. **Web app**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

4. **Background worker** (required for ingestion, retrieval, and analysis jobs)
   ```bash
   npm run build:worker
   npm run worker
   ```
   Keep this running in a second terminal so uploads are processed and jobs complete.

5. **Health check**
   ```bash
   node scripts/health-check.js http://localhost:3000
   ```

---

## Deploy on Render

The app is set up for [Render](https://render.com) with a **Web Service** (Next.js) and a **Background Worker** (multi-agent pipeline).

- **Prerequisites:** Supabase project with migrations applied, Neo4j, Gemini API key, Tavily API key, repo connected to Render.
- **Steps:** Create a Blueprint from `render.yaml`, set [environment variables](#environment-variables) for both services, deploy. Render does not run migrations—apply them in your Supabase project.

See **[DEPLOY.md](DEPLOY.md)** for prerequisites, env list, step-by-step deployment, and build troubleshooting.

**After deploy:** Open `https://<your-web-service>.onrender.com/api/health` to verify. Then use the UI to upload documents, run retrieval, and run an analysis job.

---

## Testing

Use the checklist in **[TESTING.md](TESTING.md)** to verify:

1. Health check (`/api/health`)
2. Document upload and ingestion (status → Ready)
3. Retrieval (intent → job → retrieved chunks)
4. Full analysis (totals, flagged invoices, clause comparison, action plan, report, email draft, CSV download)
5. CSV download and Tavily vendor risk insights

**Quick check on Render:**
```bash
node scripts/health-check.js https://<your-web-service>.onrender.com
```

---

## Environment variables

See `.env.example` for the full list. Required for full functionality:

| Variable | Purpose |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access |
| `SUPABASE_DB_PASSWORD` | DB password (for vector search RPC) |
| `GEMINI_API_KEY` | Google Gemini API |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | Neo4j (graph layer) |
| `TAVILY_API_KEY` | Tavily (vendor enrichment) |
| `NODE_ENV` | `production` on Render |

---

## Architecture

- **Web Service:** Serves the Next.js UI and API routes (upload, documents, retrieval, analysis, jobs, CSV download). All heavy work is deferred to the worker.
- **Background Worker:** Polls Supabase for pending **ingestion**, **retrieval**, and **analysis** jobs. For analysis it runs: Retrieval → Extraction (Gemini) → Neo4j write → Reasoning (Neo4j + Gemini) → Tavily enrichment → Execution (report, CSV, email draft). Results are stored in Supabase; the UI polls job status and displays them.

---

## Project structure

- `app/` — Next.js App Router (page, API routes)
- `lib/` — Supabase client, Neo4j client, env validation, and agents (ingestion, retrieval, extraction, reasoning, execution, Tavily)
- `worker/` — Orchestrator and worker entrypoint; runs ingestion, retrieval, and analysis pipelines
- `supabase/migrations/` — SQL migrations (tables, pgvector, jobs, vendor enrichment cache, reports bucket)
- `scripts/` — `health-check.js` (optional), worker CJS setup

Progress and known issues are tracked in **TASK_LOG.md**.

---

## License

ISC
