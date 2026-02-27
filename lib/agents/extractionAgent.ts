import { getGeminiClient } from "../ai/geminiClient";
import type {
    ExtractionAgentInput,
    ExtractionAgentOutput,
    ExtractedVendor,
    ExtractedInvoice,
    ExtractedContract,
    ExtractedClause,
    ExtractedAmount,
} from "./types";
import { randomUUID } from "crypto";

const MODEL = "gemini-2.0-flash";

const EXTRACTION_PROMPT = `You are a meticulous financial document entity extraction agent. Analyze the provided document chunks and extract ALL structured entities. Be thorough — do not skip anything.

Return a JSON object with these arrays (use empty arrays ONLY if truly none found):

{
  "vendors": [{ "name": string, "address": string|null, "contactEmail": string|null }],
  "invoices": [{ "number": string, "vendorName": string, "amount": number, "currency": string (e.g. "USD"), "date": string (ISO), "dueDate": string|null (ISO), "description": string|null }],
  "contracts": [{ "title": string, "parties": string[], "effectiveDate": string|null (ISO), "expirationDate": string|null (ISO), "value": number|null }],
  "clauses": [{ "contractId": string|null, "type": string, "text": string }],
  "amounts": [{ "value": number, "currency": string, "context": string, "sourceEntityId": string|null }]
}

CRITICAL RULES:
- Extract EVERY entity — do not summarize or skip anything.
- For invoices: always extract the total amount as a number (no currency symbols). Also extract individual line item amounts.
- **CLAUSES are NOT only in contracts.** Invoices and other documents often contain important clauses too:
  - Payment terms (e.g. "Net 30", "Due upon receipt") → type: "payment_terms"
  - Late payment penalties (e.g. "1.5% monthly interest") → type: "late_penalty"
  - Early payment discounts → type: "early_payment_discount"
  - Warranty terms → type: "warranty"
  - Return/refund policies → type: "return_policy"
  - Tax terms → type: "tax"
  - Notes, conditions, or fine print → type: "general_terms"
  - Liability, indemnity, termination, confidentiality → respective types
- Include the FULL clause text, not a summary.
- For amounts: extract EVERY monetary value you see — line items, subtotals, tax, discounts, totals. Use "context" to describe what the amount represents (e.g. "Web Development Services - line item", "Sales Tax 8.5%", "Invoice Total").
- If a vendor appears across multiple documents, list it once.
- Ensure all dates are ISO 8601 (YYYY-MM-DD).
- Return ONLY the JSON object, no markdown fences or explanation.`;


export async function runExtractionAgent(
    input: ExtractionAgentInput,
): Promise<ExtractionAgentOutput> {
    const gemini = getGeminiClient() as any;

    if (!input.relevantChunks || input.relevantChunks.length === 0) {
        return { vendors: [], invoices: [], contracts: [], clauses: [], amounts: [] };
    }

    const chunksText = input.relevantChunks
        .map((c, i) => `--- Chunk ${i + 1} (similarity: ${(c.similarity * 100).toFixed(1)}%) ---\n${c.text}`)
        .join("\n\n");

    const userPrompt = `User intent: ${input.intent}\n\nDocument chunks:\n${chunksText}`;

    const result = await gemini.models.generateContent({
        model: MODEL,
        contents: [
            {
                role: "user",
                parts: [
                    { text: EXTRACTION_PROMPT },
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
        throw new Error("Gemini returned empty extraction response");
    }

    let parsed: any;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        // Try stripping markdown fences if present
        const stripped = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(stripped);
    }

    // Normalize and assign IDs
    const vendors: ExtractedVendor[] = (parsed.vendors ?? []).map((v: any) => ({
        id: randomUUID(),
        name: v.name ?? "Unknown",
        address: v.address ?? undefined,
        contactEmail: v.contactEmail ?? undefined,
    }));

    const invoices: ExtractedInvoice[] = (parsed.invoices ?? []).map((inv: any) => ({
        id: randomUUID(),
        number: inv.number ?? "N/A",
        vendorName: inv.vendorName ?? "Unknown",
        amount: typeof inv.amount === "number" ? inv.amount : parseFloat(inv.amount) || 0,
        currency: inv.currency ?? "USD",
        date: inv.date ?? new Date().toISOString().split("T")[0],
        dueDate: inv.dueDate ?? undefined,
        description: inv.description ?? undefined,
    }));

    const contracts: ExtractedContract[] = (parsed.contracts ?? []).map((c: any) => ({
        id: randomUUID(),
        title: c.title ?? "Untitled Contract",
        parties: Array.isArray(c.parties) ? c.parties : [],
        effectiveDate: c.effectiveDate ?? undefined,
        expirationDate: c.expirationDate ?? undefined,
        value: typeof c.value === "number" ? c.value : undefined,
    }));

    const clauses: ExtractedClause[] = (parsed.clauses ?? []).map((cl: any) => ({
        id: randomUUID(),
        contractId: cl.contractId ?? undefined,
        type: cl.type ?? "general",
        text: cl.text ?? "",
    }));

    const amounts: ExtractedAmount[] = (parsed.amounts ?? []).map((a: any) => ({
        id: randomUUID(),
        value: typeof a.value === "number" ? a.value : parseFloat(a.value) || 0,
        currency: a.currency ?? "USD",
        context: a.context ?? "",
        sourceEntityId: a.sourceEntityId ?? undefined,
    }));

    console.log(
        `[extraction] Extracted: ${vendors.length} vendors, ${invoices.length} invoices, ${contracts.length} contracts, ${clauses.length} clauses, ${amounts.length} amounts`,
    );

    return { vendors, invoices, contracts, clauses, amounts };
}
