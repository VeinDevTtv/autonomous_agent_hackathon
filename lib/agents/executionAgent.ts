import { getGeminiClient } from "../ai/geminiClient";
import type {
  ExecutionAgentInput,
  ExecutionAgentOutput,
  StructuredVendorRisk,
} from "./types";

const MODEL = "gemini-2.0-flash";

/** Internal result from Gemini (no csvUrl yet; worker sets it after upload). */
export interface ExecutionAgentRawOutput {
  csvContent: string;
  markdownReport: string;
  emailDraft: string;
  jsonResult: object;
}

function buildContext(input: ExecutionAgentInput): string {
  const { intent, reasoning, extraction, vendorRiskEnrichment } = input;

  let context = `User intent: ${intent}\n\n`;
  context += "=== Reasoning Output ===\n";
  context += `Vendor totals: ${JSON.stringify(reasoning.totalsByVendor, null, 2)}\n`;
  context += `Flagged invoices: ${JSON.stringify(reasoning.flaggedInvoices, null, 2)}\n`;
  context += `Clause comparisons: ${JSON.stringify(reasoning.clauseComparisons, null, 2)}\n`;
  context += `Action plan:\n${reasoning.actionPlan}\n\n`;
  context += "=== Extracted Entities (summary) ===\n";
  context += `Vendors: ${extraction.vendors.map((v) => v.name).join(", ")}\n`;
  context += `Invoices count: ${extraction.invoices.length}\n`;
  context += `Contracts count: ${extraction.contracts.length}\n`;

  if (vendorRiskEnrichment && vendorRiskEnrichment.length > 0) {
    context += "\n=== External Vendor Risk Insights (Tavily) ===\n";
    for (const v of vendorRiskEnrichment) {
      context += `- ${v.vendor_name}: risk_level=${v.risk_level}; ${v.background_summary}\n`;
      if (v.risk_reasons.length) {
        context += `  Reasons: ${v.risk_reasons.join("; ")}\n`;
      }
    }
  }

  return context;
}

const EXECUTION_PROMPT = `You are an execution agent that turns analysis into deliverables. Given the user intent, reasoning output, extraction summary, and optional Tavily vendor risk insights, produce the following in a single JSON object:

1. **csvContent**: A CSV string (use \\n for newlines). Include two sections:
   - First: "Vendor Totals" with headers: Vendor,Total,Currency,Invoice Count. One row per vendor total.
   - Second: "Flagged Invoices" with headers: Invoice Number,Vendor,Amount,Reason. One row per flagged invoice.
   Escape quotes in cells by doubling them.

2. **markdownReport**: A full Markdown report (use \\n for newlines) with sections:
   - Executive Summary (2-3 sentences)
   - Financial Overview (vendor totals, key numbers)
   - Flagged Invoices (list with reasons)
   - Clause & Terms Summary (brief)
   - Action Plan (summary of recommended actions)
   If Tavily vendor risk data was provided, add a section "## External Vendor Risk Insights (Tavily)" with a short subsection per vendor: name, risk level, 1-3 key reasons, and note that these are from external web research.

3. **emailDraft**: A short email body (use \\n for newlines) addressed to accounting, summarizing: total spend, any flagged invoices that need attention, and if Tavily data was provided, a sentence on any high/medium risk vendors from external research. Keep it professional and under 150 words.

4. **jsonResult**: A structured object containing:
   - summary: { totalVendors, totalInvoices, totalFlagged, totalAmountByCurrency or similar }
   - totalsByVendor: same as in reasoning
   - flaggedInvoices: same as in reasoning
   - actionPlanSummary: 2-3 sentence string
   - vendor_risk_enrichment: (if Tavily data was provided) the full array of vendor risk objects; otherwise omit or empty array

Return ONLY a JSON object with keys: csvContent, markdownReport, emailDraft, jsonResult. No markdown fences.`;

/**
 * Run the Execution Agent: generate CSV content, Markdown report, email draft, and JSON result.
 * Does not upload or set csvUrl; the orchestrator uploads csvContent and sets csvUrl.
 */
export async function runExecutionAgent(
  input: ExecutionAgentInput
): Promise<ExecutionAgentRawOutput> {
  const gemini = getGeminiClient() as {
    models: {
      generateContent: (opts: {
        model: string;
        contents: unknown[];
        config: { responseMimeType: string };
      }) => Promise<{ text?: string }>;
    };
  };

  const context = buildContext(input);

  const result = await gemini.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: EXECUTION_PROMPT },
          { text: context },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  const rawText = (result.text ?? "").trim();
  if (!rawText) {
    throw new Error("Gemini returned empty execution response");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const stripped = rawText.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    parsed = JSON.parse(stripped);
  }

  const csvContent = typeof parsed.csvContent === "string" ? parsed.csvContent : "";
  const markdownReport = typeof parsed.markdownReport === "string" ? parsed.markdownReport : "";
  const emailDraft = typeof parsed.emailDraft === "string" ? parsed.emailDraft : "";
  const jsonResult = parsed.jsonResult && typeof parsed.jsonResult === "object" ? parsed.jsonResult as object : {};

  // Ensure vendor_risk_enrichment is in jsonResult when we have it
  if (input.vendorRiskEnrichment && input.vendorRiskEnrichment.length > 0) {
    const j = jsonResult as Record<string, unknown>;
    j.vendor_risk_enrichment = input.vendorRiskEnrichment as unknown as StructuredVendorRisk[];
  }

  console.log(
    `[execution] Generated CSV ${csvContent.length} chars, report ${markdownReport.length} chars, email ${emailDraft.length} chars`
  );

  return { csvContent, markdownReport, emailDraft, jsonResult };
}

/**
 * Build the final ExecutionAgentOutput with csvUrl (to be set by orchestrator after upload).
 */
export function buildExecutionOutput(
  raw: ExecutionAgentRawOutput,
  csvUrl: string
): ExecutionAgentOutput {
  return {
    csvUrl,
    markdownReport: raw.markdownReport,
    emailDraft: raw.emailDraft,
    jsonResult: raw.jsonResult,
  };
}
