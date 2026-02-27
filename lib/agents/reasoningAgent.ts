import { getGeminiClient } from "../ai/geminiClient";
import { getNeo4jDriver } from "../neo4j/neo4jClient";
import type {
    ReasoningAgentInput,
    ReasoningAgentOutput,
    VendorTotal,
    FlaggedInvoice,
    ClauseComparison,
} from "./types";

const MODEL = "gemini-3.1-pro-preview";

/**
 * Query Neo4j for aggregated vendor data, or fall back to extraction-only analysis.
 */
async function getGraphContext(input: ReasoningAgentInput): Promise<string> {
    const driver = getNeo4jDriver();
    if (!driver) {
        return buildFallbackContext(input);
    }

    const session = driver.session();
    try {
        // Vendor invoice totals
        const vendorTotals = await session.run(
            `MATCH (i:Invoice)-[:INVOICE_FROM_VENDOR]->(v:Vendor)
       RETURN v.name AS vendor, SUM(i.amount) AS total, COUNT(i) AS count, i.currency AS currency
       ORDER BY total DESC`,
        );

        // High-value invoices
        const flagged = await session.run(
            `MATCH (i:Invoice)-[:INVOICE_FROM_VENDOR]->(v:Vendor)
       WHERE i.amount > 5000
       RETURN i.id AS id, i.number AS number, v.name AS vendor, i.amount AS amount
       ORDER BY i.amount DESC`,
        );

        // Clauses by type
        const clauses = await session.run(
            `MATCH (cl:Clause)
       OPTIONAL MATCH (c:Contract)-[:HAS_CLAUSE]->(cl)
       RETURN cl.type AS type, cl.text AS text, c.title AS contractTitle
       ORDER BY cl.type`,
        );

        let context = "=== Neo4j Graph Data ===\n\n";

        context += "Vendor Invoice Totals:\n";
        for (const rec of vendorTotals.records) {
            context += `- ${rec.get("vendor")}: ${rec.get("currency") ?? "USD"} ${rec.get("total")} (${rec.get("count")} invoices)\n`;
        }

        context += "\nHigh-Value Invoices (>$5,000):\n";
        for (const rec of flagged.records) {
            context += `- Invoice #${rec.get("number")} from ${rec.get("vendor")}: $${rec.get("amount")}\n`;
        }

        context += "\nClauses:\n";
        for (const rec of clauses.records) {
            const title = rec.get("contractTitle") ?? "Unknown Contract";
            context += `- [${rec.get("type")}] (${title}): ${(rec.get("text") ?? "").slice(0, 200)}\n`;
        }

        return context;
    } catch (error) {
        console.warn("[reasoning] Neo4j query failed, falling back to extraction data:", error);
        return buildFallbackContext(input);
    } finally {
        await session.close();
    }
}

function buildFallbackContext(input: ReasoningAgentInput): string {
    const { extraction } = input;
    let context = "=== Extracted Entity Data (no Neo4j) ===\n\n";

    context += `Vendors (${extraction.vendors.length}):\n`;
    for (const v of extraction.vendors) {
        context += `- ${v.name}\n`;
    }

    context += `\nInvoices (${extraction.invoices.length}):\n`;
    for (const inv of extraction.invoices) {
        context += `- #${inv.number} from ${inv.vendorName}: ${inv.currency} ${inv.amount} (${inv.date})\n`;
    }

    context += `\nContracts (${extraction.contracts.length}):\n`;
    for (const c of extraction.contracts) {
        context += `- ${c.title} — parties: ${c.parties.join(", ")}\n`;
    }

    context += `\nClauses (${extraction.clauses.length}):\n`;
    for (const cl of extraction.clauses) {
        context += `- [${cl.type}]: ${cl.text.slice(0, 200)}\n`;
    }

    return context;
}

const REASONING_PROMPT = `You are a senior financial analyst AI. Perform a thorough, expert-level analysis of the provided entity data. Your output should be detailed and actionable — not generic or surface-level.

Produce a JSON object with these keys:

1. **totalsByVendor**: For each vendor, calculate total invoice amount and count. Include ALL vendors even if they have just one invoice.

2. **flaggedInvoices**: Flag invoices for ANY of these reasons (check all):
   - Amount exceeds $5,000
   - Missing or invalid due date
   - Due date is in the past (overdue)
   - Duplicate invoice numbers across vendors
   - Unusually high amounts relative to other invoices from the same vendor
   - Missing descriptions
   - Very short payment windows (< 14 days between date and dueDate)
   For each flag, write a SPECIFIC, detailed reason — not just "exceeds $5,000".

3. **clauseComparisons**: Group extracted clauses by type. For each group:
   - Include all clauses of that type with their source contract/document
   - Write a detailed analysis: What are the specific risks? Which clauses are more favorable? Any missing protections?
   - If there's only one clause of a type, still analyze its implications and risks
   - Include payment terms, late penalty clauses, and any other terms found in invoices

4. **actionPlan**: Write a COMPREHENSIVE action plan (at least 3-5 paragraphs) structured as follows:
   - **Financial Overview**: Total spend across all vendors, breakdown by vendor, largest line items
   - **Risk Assessment**: Which invoices need immediate attention and why (overdue, high amounts, unfavorable terms)
   - **Compliance & Terms Review**: Analysis of payment terms, late penalties, and any concerning clauses
   - **Recommended Actions**: Numbered list of specific, actionable next steps (e.g., "1. Approve Invoice #X by [date] to avoid the 1.5% late penalty", "2. Negotiate better payment terms with Vendor Y")
   - **Monitoring Suggestions**: What to watch going forward

Return format:
{
  "totalsByVendor": [{ "vendorName": string, "totalAmount": number, "currency": string, "invoiceCount": number }],
  "flaggedInvoices": [{ "invoiceId": string, "number": string, "vendorName": string, "amount": number, "reason": string }],
  "clauseComparisons": [{ "clauseType": string, "clauses": [{ "contractTitle": string, "text": string }], "analysis": string }],
  "actionPlan": string
}

The actionPlan should use line breaks (\\n) for paragraph separation. Be specific — reference actual invoice numbers, vendor names, amounts, and dates from the data.

Return ONLY the JSON object.`;


export async function runReasoningAgent(
    input: ReasoningAgentInput,
): Promise<ReasoningAgentOutput> {
    const gemini = getGeminiClient() as any;

    const graphContext = await getGraphContext(input);

    const userPrompt = `User intent: ${input.intent}\n\n${graphContext}\n\nFull extracted entities:\n${JSON.stringify(input.extraction, null, 2)}`;

    const result = await gemini.models.generateContent({
        model: MODEL,
        contents: [
            {
                role: "user",
                parts: [
                    { text: REASONING_PROMPT },
                    { text: userPrompt },
                ],
            },
        ],
        config: {
            responseMimeType: "application/json",
        },
    });

    const rawText = (result.text ?? "").trim();
    if (!rawText) {
        throw new Error("Gemini returned empty reasoning response");
    }

    let parsed: any;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        const stripped = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(stripped);
    }

    const totalsByVendor: VendorTotal[] = (parsed.totalsByVendor ?? []).map((t: any) => ({
        vendorName: t.vendorName ?? "Unknown",
        totalAmount: typeof t.totalAmount === "number" ? t.totalAmount : 0,
        currency: t.currency ?? "USD",
        invoiceCount: typeof t.invoiceCount === "number" ? t.invoiceCount : 0,
    }));

    const flaggedInvoices: FlaggedInvoice[] = (parsed.flaggedInvoices ?? []).map((f: any) => ({
        invoiceId: f.invoiceId ?? "",
        number: f.number ?? "N/A",
        vendorName: f.vendorName ?? "Unknown",
        amount: typeof f.amount === "number" ? f.amount : 0,
        reason: f.reason ?? "",
    }));

    const clauseComparisons: ClauseComparison[] = (parsed.clauseComparisons ?? []).map((cc: any) => ({
        clauseType: cc.clauseType ?? "general",
        clauses: Array.isArray(cc.clauses)
            ? cc.clauses.map((cl: any) => ({
                contractTitle: cl.contractTitle ?? "Unknown",
                text: cl.text ?? "",
            }))
            : [],
        analysis: cc.analysis ?? "",
    }));

    const actionPlan: string = typeof parsed.actionPlan === "string" ? parsed.actionPlan : "";

    console.log(
        `[reasoning] Results: ${totalsByVendor.length} vendor totals, ${flaggedInvoices.length} flagged, ${clauseComparisons.length} clause comparisons`,
    );

    return { totalsByVendor, flaggedInvoices, clauseComparisons, actionPlan };
}
