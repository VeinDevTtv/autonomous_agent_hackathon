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

Always run commands correctly so you use the terminal correctly when needed:

```bash
cmd /c "cd /d c:\Personals\path\to\location && command"
```

**Start:** Create/confirm the rules file and `TASK_LOG.md`, then build Phase 1 (Upload & Ingestion). Update `TASK_LOG.md` after Phase 1 before starting Phase 2.
