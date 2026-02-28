# Testing Smart Document Filler

Use this checklist to verify the app works correctly, locally or on Render.

## Prerequisites

- **Local:** `.env` populated from `.env.example`; Supabase migrations applied; worker optional for full pipeline.
- **Render:** Web and worker services deployed; env vars set; Supabase migrations applied. See [DEPLOY.md](DEPLOY.md).

**Base URL:** For Render, use `https://<your-web-service>.onrender.com`. For local, use `http://localhost:3000`.

---

## 1. Health check

- **Manual:** Open `{BASE_URL}/api/health` in a browser or with `curl`.
- **Script (optional):**  
  `node scripts/health-check.js https://your-app.onrender.com`

**Expected:** JSON with `ok: true`, `supabase.ok: true`, `gemini.ok: true` (if key set), and `neo4j.ok: true` when Neo4j is configured. Status 200.

---

## 2. Document upload & ingestion

1. Open the app at `{BASE_URL}`.
2. Upload one or more documents (PDF, PNG, or plain text).
3. Confirm the list shows the new documents; status should move from **Uploading** → **Ingesting** → **Ready** (worker must be running for ingestion).
4. If a document stays in error, use **Retry** (if available) or check worker logs.

**APIs used:** `POST /api/upload`, `GET /api/documents`, `GET /api/documents/[id]/status`.

---

## 3. Retrieval (semantic search)

1. Enter an **intent** (e.g. “invoices over $5000” or “contract liability clauses”).
2. Click the retrieval submit button.
3. Wait for the job to complete (UI polls automatically).
4. Confirm **Retrieved chunks** show with similarity scores.

**APIs used:** `POST /api/retrieval` (body: `{ "intent": "..." }`), `GET /api/jobs/[id]`.

---

## 4. Full analysis (extraction → reasoning → execution)

1. Ensure at least one document is **Ready** (and ideally several invoices and/or a contract).
2. Enter an **analysis intent** (e.g. “Summarize vendor totals, flag invoices over $5,000, compare contract liability clauses, and draft an email to accounting”).
3. Submit the analysis job.
4. Wait for completion (polling). Then verify:
   - **Vendor totals** table
   - **Flagged invoices** (if any match)
   - **Clause comparisons** (if contracts/clauses exist)
   - **Action plan** text
   - **Markdown report** and **Email draft**
   - **Download CSV** link works
   - **External Vendor Risk Insights** (Tavily) if vendors were enriched

**APIs used:** `POST /api/analysis` (body: `{ "intent": "..." }`), `GET /api/jobs/[id]`, `GET /api/jobs/[id]/download/csv`.

---

## 5. CSV download

1. After an analysis job completes, click **Download CSV**.
2. Confirm the browser gets a file (signed URL redirect from Supabase Storage).

**API:** `GET /api/jobs/[id]/download/csv` → redirect to signed URL.

---

## Quick verification (Render)

After deploy, run:

```bash
# Replace with your Render web service URL
node scripts/health-check.js https://smart-document-filler-web.onrender.com
```

Then in the UI: upload a small PDF or text file → wait for Ready → run retrieval → run analysis with a short intent. If all steps succeed, the pipeline is working end-to-end.
