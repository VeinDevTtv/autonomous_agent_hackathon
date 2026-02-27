---
trigger: always_on
glob:
description: Smart Document Filler — Coding Agent Rules
---

# Smart Document Filler — Coding Agent Rules

You are the coding agent for the **Smart Document Filler** MVP. Follow these rules exactly.

## Paths (single source of truth)

- **Rules file:** `.agents/rules/autonomousagent.md` (updated from `.cursor/rules/smart-document-filler.mdc`)
- **Task tracker:** `TASK_LOG.md` (project root). Update it whenever a phase/task is completed; log errors and exceptions there.

## Architecture (mandatory)

- **AI:** Gemini Pro (reasoning, multi-step), Gemini Vision (images/PDF OCR), Gemini Embeddings (semantic retrieval).
- **Backend:** Supabase — Auth, Storage, Vector DB; Neo4j — graph database layer for entity relationships.
- **Frontend:** Next.js; deploy on Render.
- **Services:** Tavily API for vendor risk enrichment and external research.
- **Workflow:** Structured **multi-agent** workflow (no single-prompt chains).

## Agents and responsibilities

1. **Ingestion Agent** — Extract, normalize, OCR, chunk, embed, and store in Supabase.
2. **Retrieval Agent** — Fetch relevant chunks from Supabase vector DB.
3. **Extraction Agent** — Parse structured JSON, extract entities, and create/update Neo4j nodes:
   - Vendor
   - Invoice
   - Contract
   - Clause
   - Amount
   - Create relationships between these nodes to represent document and entity links.
4. **Reasoning Agent** — Use Neo4j queries for:
   - Multi-document comparisons
   - Clause similarity
   - Vendor invoice aggregation
   And use Tavily API to enrich vendor data (risk, background) before generating an action plan.
5. **Execution Agent** — Generate CSV, JSON, Markdown, email drafts; optional webhooks, and include Tavily findings in the final report.
## Orchestrator Architecture (Mandatory)

- All multi-agent execution must be managed by a centralized Orchestrator module.
- The Orchestrator runs in the Render Background Worker.
- The frontend must never directly call Gemini, Neo4j, or Tavily.
- Flow:
  1. Frontend submits analysis request.
  2. API route creates job record in Supabase.
  3. Background Worker picks up job.
  4. Worker runs agents in sequence:
     Ingestion → Retrieval → Extraction → Neo4j Write → Reasoning → Tavily Enrichment → Execution.
  5. Results stored in Supabase.
  6. Frontend polls for completion.

- Orchestrator must:
  - Handle errors gracefully.
  - Log failures in TASK_LOG.md.
  - Ensure each agent receives structured JSON input and produces structured JSON output.

## Standard Agent Interfaces (Strict JSON Contracts)

Define required outputs:

### Ingestion Agent Output
{
  documentId: string,
  chunks: [{ id: string, text: string, embedding: number[] }]
}

### Retrieval Agent Output
{
  relevantChunks: [{ chunkId: string, text: string, similarity: number }]
}

### Extraction Agent Output
{
  vendors: [],
  invoices: [],
  contracts: [],
  clauses: [],
  amounts: []
}

### Reasoning Agent Output
{
  totalsByVendor: [],
  flaggedInvoices: [],
  clauseComparisons: [],
  actionPlan: string
}

### Execution Agent Output
{
  csvUrl: string,
  markdownReport: string,
  emailDraft: string,
  jsonResult: object
}

Agents must strictly adhere to these contracts.

## Environment Variable Discipline (Mandatory)

- Any time new environment variables are introduced:
  - Update `.env.example`.
  - Mention the change in `TASK_LOG.md`.
  - Notify the user in the final message summary.
- Never hardcode secrets.
- All services must read from process.env only.
- The app must fail fast at startup if required env vars are missing.

## Supabase Vector Schema Requirements

- Use pgvector extension.
- Embedding column must define dimension size based on Gemini Embeddings model.
- Use cosine similarity.
- Implement a SQL RPC function for vector search:
  match_documents(query_embedding vector, match_count int)

- Retrieval Agent must use this RPC function.

## Neo4j Requirements

- Create unique constraints on all node IDs.
- Prevent duplicate vendor creation.
- All Neo4j writes must occur after Extraction Agent.

## Tavily Requirements

- Tavily enrichment must:
  - Run only once per unique vendor.
  - Cache results in Supabase.
  - Not re-query if cached within 24h.

## Render Worker Requirement

- Multi-agent orchestration must run in Render Background Worker.
- Frontend API routes must be lightweight and non-blocking.
- No long-running Gemini calls in request-response cycle.

## Skills (`.agents/skills`)

Use these project-specific skills by reading their `SKILL.md` files and following their instructions exactly:

- **Neo4j Entity Graph Engine** (`.agents/skills/neo4j-entity-graph-engine/SKILL.md`): Manage Neo4j-based graph storage and querying of extracted entities (vendors, invoices, contracts, clauses, amounts). Use after the Extraction Agent has produced structured entities and when the Reasoning Agent needs graph aggregation, clause comparison, or anomaly detection.
- **Render Deployment Orchestrator** (`.agents/skills/render-deployment-orchestrator/SKILL.md`): Plan and manage deployment of Smart Document Filler on Render, including web service, background worker, environment variables, and stateless architecture. Use whenever deploying or updating the app on Render or editing `render.yaml`.
- **Tavily Vendor Risk Enrichment** (`.agents/skills/tavily-vendor-risk-enrichment/SKILL.md`): Integrate Tavily for external vendor risk research. Use after vendors are extracted and written to Neo4j, during the Reasoning/Execution phases, to enrich vendor analysis and attach structured risk data to reports, email drafts, and JSON outputs.

## MVP scope (8h)

- Upload & parse documents.
- Intent prompt box.
- Multi-agent workflow execution.
- Multi-document comparison.

## Demo scenario

User uploads 5 invoices + 1 contract. Prompt: *"Summarize vendor totals, flag invoices over $5,000, compare contract liability clauses, and draft an email to accounting."* Output: table of totals, flagged anomalies, liability comparison, email draft, downloadable CSV.

## Your tasks

1. **Rules:** Always follow the architecture above; use Gemini agents as specified; use **only** Supabase for storage, embeddings, auth.
2. **Task tracker:** After completing any phase/task, immediately update `TASK_LOG.md` (mark done or append). Log errors/exceptions in that file.
3. **Execution:** Build **phase by phase** — Upload → Ingestion → Retrieval → Extraction → Reasoning → Execution. Mark a task complete in `TASK_LOG.md` only when it is **fully functional**.
4. **Deliverables:** Working agents in code, this rules file, and an up-to-date `TASK_LOG.md`.

## Constraints

- Be concise and practical. Focus on Gemini integration. Do not skip phases or outputs. `TASK_LOG.md` is the single source of truth for progress.

## Terminal Execution Strategy (Mandatory)

**Do NOT run terminal commands directly.** Instead, tell the user what commands to run and let them execute manually. Focus only on writing code.

**Start:** Create/confirm the rules file and `TASK_LOG.md`, then build Phase 1 (Upload & Ingestion). Update `TASK_LOG.md` after Phase 1 before starting Phase 2.
