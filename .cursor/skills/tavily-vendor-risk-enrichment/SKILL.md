---
name: tavily-vendor-risk-enrichment
description: Integrates the Tavily API to enrich vendor entities with external research and risk signals. Use after vendor extraction and graph insertion, during the Reasoning Agent stage, when enhancing vendor analysis with company background, fraud reports, legal issues, and risk indicators, and when attaching structured enrichment data to Markdown reports, email drafts, and JSON outputs while caching results in Supabase.
---

# Tavily Vendor Risk Enrichment

## When to Use This Skill

Use this skill **after**:

1. Vendor entities have been extracted from documents.
2. Vendor nodes and relationships have been inserted into Neo4j.
3. The Reasoning Agent is preparing multi-vendor analysis, anomaly detection, or final outputs (Markdown report, email draft, JSON result).

Only use Tavily for **external research** — never as a replacement for Gemini reasoning over internal document data.

## High-Level Workflow

Follow this workflow when enriching vendor risk:

1. **Input**: Receive one or more vendor names (and optional metadata such as country, website, or identifiers if available).
2. **Check cache**: Look up any existing Tavily enrichment for each vendor in Supabase.
3. **Call Tavily (if needed)**:
   - Query Tavily using the vendor name and optional context to retrieve:
     - Company background
     - Fraud reports
     - Legal issues
     - Risk indicators / red flags
4. **Summarize with Gemini**:
   - Use Gemini Pro to summarize Tavily results into a concise, structured risk profile.
   - Clearly distinguish **external Tavily findings** from **internal document analysis**.
5. **Persist enrichment**:
   - Store the structured enrichment JSON in Supabase keyed by a stable vendor identifier.
6. **Attach to outputs**:
   - Include enrichment in:
     - Final Markdown report
     - Email draft
     - JSON result payload
   - Make enrichment clearly optional but visible in the demo (e.g., a dedicated “External Vendor Risk Insights” section).

## Responsibilities

When this skill is active, the agent should:

1. **Accept vendor input**
   - Handle a single vendor name or a list of vendors.
   - Prefer stable identifiers (e.g., vendor node ID, canonical name) when available.

2. **Integrate with Tavily**
   - Use Tavily **only** to gather external information (open web search, news, reports).
   - Target queries around:
     - Company background and profile
     - Historical fraud or scam reports
     - Legal disputes, sanctions, or regulatory actions
     - Reputation and risk indicators
   - Keep API usage efficient:
     - Reuse cached results.
     - Avoid repeated calls for the same vendor within a session.

3. **Summarize with Gemini Pro**
   - Use Gemini Pro to:
     - Clean up noisy Tavily results.
     - Extract relevant risk-related findings.
     - Produce human-readable summaries.
   - Do **not** delegate reasoning about internal invoices/contracts to Tavily; that must use internal embeddings, Neo4j, and Gemini.

4. **Update outputs**
   - Add an **"External Vendor Risk Insights (Tavily)"** section to:
     - The Markdown report.
     - The email draft (as a short paragraph or bullet list).
   - Extend the JSON result with a `vendor_risk_enrichment` field following the format below.

5. **Cache in Supabase**
   - Use Supabase as the cache layer:
     - Store enrichment keyed by a stable vendor key (e.g., `vendor_id` or normalized vendor name).
     - Include timestamps so stale data can be refreshed when needed.

## Structured Vendor Risk JSON Format

Use this JSON shape whenever representing vendor risk enrichment:

```json
{
  "vendor_id": "neo4j-vendor-node-id-or-stable-key",
  "vendor_name": "ACME Corp",
  "source": "tavily",
  "last_refreshed_at": "2026-02-27T10:00:00Z",
  "background_summary": "Short summary of company background based on Tavily results.",
  "risk_level": "low | medium | high | unknown",
  "risk_reasons": [
    "Reason 1 derived from Tavily findings and Gemini reasoning.",
    "Reason 2..."
  ],
  "fraud_signals": [
    {
      "title": "Alleged invoice fraud case (2019)",
      "description": "Short description from Tavily results.",
      "severity": "low | medium | high",
      "source_url": "https://example.com/article"
    }
  ],
  "legal_issues": [
    {
      "title": "Regulatory action by XYZ authority",
      "description": "Short description from Tavily results.",
      "status": "active | resolved | alleged",
      "source_url": "https://example.com/legal"
    }
  ],
  "other_indicators": [
    {
      "category": "reputation | sanctions | news | other",
      "description": "Relevant signal or observation.",
      "source_url": "https://example.com/source"
    }
  ],
  "notes": "Any additional context or caveats the Reasoning Agent wants to record."
}
```

For multiple vendors, use an array of objects in this exact structure.

## Implementation Guidance

### Tavily API Integration Utility

When implementing the Tavily integration utility:

1. Provide a function that:
   - Accepts a `vendor_name` (and optional metadata).
   - Checks Supabase for cached enrichment.
   - Only calls Tavily if no cache is found or data is stale.
2. Wrap raw Tavily responses into a normalized intermediate structure before summarization.
3. Pass the normalized data into Gemini Pro to produce the `background_summary`, `risk_level`, and detailed lists.
4. Store the final structured JSON in Supabase and return it to callers.

### Enrichment Function

Implement an enrichment function that:

1. Accepts:
   - A list of vendor entities or IDs.
   - Optional flags (e.g., `force_refresh`, `include_external_enrichment`).
2. For each vendor:
   - Invoke the Tavily integration utility.
   - Attach the resulting JSON to the in-memory vendor representation or graph context.
3. Returns:
   - A combined structure with:
     - Internal document-based metrics (from Neo4j / internal analysis).
     - External `vendor_risk_enrichment` array as defined above.

### Output Integration

When preparing final outputs:

- **Markdown report**
  - Add a section:
    - `## External Vendor Risk Insights (Tavily)`
    - Include a short table or bullet list per vendor:
      - Vendor name
      - Risk level
      - 1–3 key reasons
      - Links to key sources (if appropriate)

- **Email draft**
  - Add a short paragraph near the end:
    - Summarizing any **high-risk** or **medium-risk** vendors.
    - Emphasizing that these findings come from **external web research via Tavily**.

- **JSON result**
  - Add a top-level field, for example:
    - `"vendor_risk_enrichment": [ ...structured vendor risk JSON objects... ]`

## Constraints and Guardrails

- **External vs internal separation**
  - Clearly label any Tavily-derived insights as **external research**.
  - Do not mix Tavily content with internal document data in the same field.

- **Optional but demo-visible**
  - Make enrichment opt-in via a flag (e.g., `include_external_enrichment: true`).
  - In demo flows, enable this flag to showcase external intelligence.

- **API efficiency**
  - Prefer batch processing when vendors share similar queries.
  - Cache aggressively in Supabase to avoid duplicate Tavily calls.
  - Avoid unnecessary re-queries within the same task run.

## Examples

### Example 1: Single Vendor Enrichment

Input:

- Vendor name: `"ACME Payments Ltd"`
- `include_external_enrichment: true`

Behavior:

1. Check Supabase cache for `"ACME Payments Ltd"`.
2. If missing or stale, query Tavily, normalize results, summarize with Gemini Pro.
3. Produce a structured JSON object in the format above.
4. Attach to:
   - Markdown report under “External Vendor Risk Insights (Tavily)”.
   - Email draft as a short risk summary.
   - JSON result under `vendor_risk_enrichment`.

### Example 2: Multiple Vendors in Reasoning Agent

Input:

- Vendor list: `["ACME Corp", "Globex LLC", "Initech Inc"]`

Behavior:

1. For each vendor, resolve cache or query Tavily as needed.
2. Build an array of vendor risk JSON objects.
3. Use these to:
   - Highlight vendors with `risk_level` of `high` in the final report and email.
   - Support anomaly detection by correlating high external risk with internal invoice anomalies.

