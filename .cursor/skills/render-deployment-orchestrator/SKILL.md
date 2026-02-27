---
name: render-deployment-orchestrator
description: Manage deployment and hosting of the Smart Document Filler application on Render, configuring web service and background worker, environment variables, and stateless architecture. Use when the user mentions deploying to Render, render.yaml, Render web services, background workers, or production deployment of the Smart Document Filler multi-agent system.
---

# Render Deployment Orchestrator

## Instructions

Use this skill whenever the user wants to deploy or update the Smart Document Filler application on **Render**.

### 1. Core constraints

1. All hosting must be on **Render**.
2. **Never** propose or generate deployments for Vercel (or migrate to Vercel).  
   - If the user asks about Vercel, explain that this project is pinned to Render and provide Render-based guidance instead.
3. Long-running multi-agent orchestration must run in a **background worker**, not in frontend or API routes.
4. Design must be **stateless**:
   - Do not rely on local disk for persistence (no `fs`-based storage for uploads or state).
   - Use **Supabase Storage** for files and Supabase DB/Vector DB for embeddings/state.
5. Assume:
   - Frontend: Next.js (Node runtime)
   - Backend: Next.js API routes or Node.js server
   - Background worker: Node.js process (multi-agent orchestration server)
   - AI: Gemini (Pro, Vision, Embeddings)
   - Storage/Auth/Vector DB: Supabase
   - Neo4j for graph queries
   - Tavily for external enrichment

### 2. High-level deployment architecture

When planning or updating deployment, ensure the following components exist and are clearly separated:

1. **Render Web Service**  
   - Hosts the **Next.js** application (UI + API routes that must respond quickly).
   - Runs a production build:
     - `npm install`
     - `npm run build`
     - `npm start` (or the appropriate Next.js production start command)
   - Handles:
     - User-facing pages
     - Short-lived API endpoints (e.g., trigger jobs, status checks, fetch summaries)
   - Must **not** run long-running multi-agent orchestration loops directly.

2. **Render Background Worker**  
   - Dedicated process for **multi-agent orchestration** and other long-running tasks.
   - Uses the same codebase or a subdirectory (e.g., `worker/`) as appropriate.
   - Exposes no public HTTP endpoint by default (unless explicitly needed).
   - Pulls jobs from a queue (or runs internal schedules) and interacts with:
     - Supabase (auth, storage, vector DB)
     - Neo4j (graph queries)
     - Gemini (via `GEMINI_API_KEY`)
     - Tavily (via `TAVILY_API_KEY`)

3. **Communication pattern**
   - Frontend/API enqueues work (e.g., insert job records into Supabase or another queue).
   - Worker picks up jobs, runs the full multi-agent pipeline, and writes results back to Supabase/Neo4j.
   - Frontend polls or subscribes to Supabase to show job status and results.
   - This ensures **frontend requests are never blocked** by long-running workflows.

### 3. Required environment variables

Whenever configuring services or generating a `render.yaml`, ensure the following environment variables are present (but never hard-code values):

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEO4J_URI`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`
- `TAVILY_API_KEY`

Guidelines:

1. **Never** commit secrets to the repository.
2. In `render.yaml`, reference keys only; values are set in the Render dashboard or via synced environment groups.
3. Prefer using `envVars` or environment groups so both web service and worker share consistent settings.
4. If the user asks, recommend:
   - One Render **Environment Group** containing all shared variables.
   - Attach that group to both the web service and worker.

### 4. `render.yaml` generation and validation

When asked to make deployment production-ready or to create/update configuration:

1. **Check for an existing `render.yaml`:**
   - If present, read and adapt it (do not blindly overwrite).
   - Ensure it defines:
     - One `web` service for the Next.js app.
     - One `worker` service for the multi-agent orchestration.

2. **If no `render.yaml` exists, generate a baseline** like this and adjust paths/commands to match the actual project:

services:
  - type: web
    name: smart-document-filler-web
    env: node
    runtime: node
    region: oregon
    plan: starter
    buildCommand: npm install && npm run build
    startCommand: npm start
    rootDir: .
    autoDeploy: true
    envVars:
      - key: GEMINI_API_KEY
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: NEO4J_URI
        sync: false
      - key: NEO4J_USERNAME
        sync: false
      - key: NEO4J_PASSWORD
        sync: false
      - key: TAVILY_API_KEY
        sync: false

  - type: worker
    name: smart-document-filler-worker
    env: node
    runtime: node
    region: oregon
    plan: starter
    buildCommand: npm install && npm run build
    startCommand: npm run worker
    rootDir: .
    autoDeploy: true
    envVars:
      - key: GEMINI_API_KEY
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: NEO4J_URI
        sync: false
      - key: NEO4J_USERNAME
        sync: false
      - key: NEO4J_PASSWORD
        sync: false
      - key: TAVILY_API_KEY
        sync: false
