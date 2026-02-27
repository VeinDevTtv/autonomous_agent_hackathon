import { getServiceSupabaseClient } from "../supabaseClient";
import { getGeminiClient } from "../ai/geminiClient";
import type { StructuredVendorRisk } from "./types";

const TAVILY_API = "https://api.tavily.com/search";
const CACHE_TTL_HOURS = 24;
const MODEL = "gemini-2.0-flash";

function getTavilyApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key || !key.trim()) {
    throw new Error("TAVILY_API_KEY is required for vendor enrichment");
  }
  return key.trim();
}

/** Normalize vendor to a stable cache key (id or slugified name). */
function vendorKey(id: string, name: string): string {
  if (id && id.trim()) return id.trim();
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "unknown";
}

/**
 * Read cached enrichment from Supabase. Returns null if missing or stale (>24h).
 */
export async function getCachedEnrichment(
  vendorKeyStr: string
): Promise<StructuredVendorRisk | null> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("vendor_enrichment_cache")
    .select("enrichment, last_refreshed_at")
    .eq("vendor_key", vendorKeyStr)
    .maybeSingle();

  if (error || !data) return null;

  const refreshed = new Date((data.last_refreshed_at as string).replace("Z", "")).getTime();
  const now = Date.now();
  const ttlMs = CACHE_TTL_HOURS * 60 * 60 * 1000;
  if (now - refreshed > ttlMs) return null;

  return data.enrichment as StructuredVendorRisk;
}

/**
 * Call Tavily search API and return raw results.
 */
async function tavilySearch(query: string, maxResults = 5): Promise<unknown[]> {
  const key = getTavilyApiKey();
  const res = await fetch(TAVILY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: maxResults,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { results?: unknown[] };
  return Array.isArray(json.results) ? json.results : [];
}

/**
 * Build structured vendor risk from raw Tavily results using Gemini.
 */
async function summarizeWithGemini(
  vendorName: string,
  vendorId: string,
  rawResults: unknown[]
): Promise<StructuredVendorRisk> {
  const gemini = getGeminiClient() as { models: { generateContent: (opts: unknown) => Promise<{ text?: string }> } };

  const prompt = `You are a risk analyst. Below are raw web search results about the company "${vendorName}". 
Summarize them into a structured vendor risk profile. Be concise. If no relevant risk info is found, set risk_level to "unknown" and background_summary to a short note.

Raw search results (JSON):
${JSON.stringify(rawResults, null, 2)}

Return a single JSON object with exactly these keys (use empty arrays where no data):
- vendor_id: string ("${vendorId}")
- vendor_name: string ("${vendorName}")
- source: "tavily"
- last_refreshed_at: string (ISO 8601, current time)
- background_summary: string (2-4 sentences)
- risk_level: "low" | "medium" | "high" | "unknown"
- risk_reasons: string[] (1-5 short reasons)
- fraud_signals: [{ "title": string, "description": string, "severity": "low"|"medium"|"high", "source_url": string|null }]
- legal_issues: [{ "title": string, "description": string, "status": "active"|"resolved"|"alleged", "source_url": string|null }]
- other_indicators: [{ "category": string, "description": string, "source_url": string|null }]
- notes: string

Return ONLY the JSON object, no markdown.`;

  const result = await gemini.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });

  const rawText = (result.text ?? "").trim();
  if (!rawText) {
    return buildMinimalEnrichment(vendorId, vendorName, "Gemini returned empty response");
  }

  try {
    const parsed = JSON.parse(rawText.replace(/```json\s*/g, "").replace(/```/g, "").trim()) as Record<string, unknown>;
    return normalizeStructuredRisk(parsed, vendorId, vendorName);
  } catch {
    return buildMinimalEnrichment(vendorId, vendorName, "Failed to parse Gemini response");
  }
}

function buildMinimalEnrichment(
  vendorId: string,
  vendorName: string,
  notes: string
): StructuredVendorRisk {
  return {
    vendor_id: vendorId,
    vendor_name: vendorName,
    source: "tavily",
    last_refreshed_at: new Date().toISOString(),
    background_summary: "",
    risk_level: "unknown",
    risk_reasons: [],
    fraud_signals: [],
    legal_issues: [],
    other_indicators: [],
    notes,
  };
}

function normalizeStructuredRisk(
  parsed: Record<string, unknown>,
  vendorId: string,
  vendorName: string
): StructuredVendorRisk {
  const level = parsed.risk_level as string;
  const riskLevel =
    level === "low" || level === "medium" || level === "high" || level === "unknown"
      ? level
      : "unknown";

  return {
    vendor_id: typeof parsed.vendor_id === "string" ? parsed.vendor_id : vendorId,
    vendor_name: typeof parsed.vendor_name === "string" ? parsed.vendor_name : vendorName,
    source: "tavily",
    last_refreshed_at:
      typeof parsed.last_refreshed_at === "string"
        ? parsed.last_refreshed_at
        : new Date().toISOString(),
    background_summary: typeof parsed.background_summary === "string" ? parsed.background_summary : "",
    risk_level: riskLevel,
    risk_reasons: Array.isArray(parsed.risk_reasons)
      ? parsed.risk_reasons.filter((r): r is string => typeof r === "string")
      : [],
    fraud_signals: Array.isArray(parsed.fraud_signals)
      ? parsed.fraud_signals.map((f: unknown) => {
          const x = f as Record<string, unknown>;
          return {
            title: typeof x.title === "string" ? x.title : "",
            description: typeof x.description === "string" ? x.description : "",
            severity:
              x.severity === "low" || x.severity === "medium" || x.severity === "high"
                ? x.severity
                : "low",
            source_url: typeof x.source_url === "string" ? x.source_url : undefined,
          };
        })
      : [],
    legal_issues: Array.isArray(parsed.legal_issues)
      ? parsed.legal_issues.map((l: unknown) => {
          const x = l as Record<string, unknown>;
          return {
            title: typeof x.title === "string" ? x.title : "",
            description: typeof x.description === "string" ? x.description : "",
            status:
              x.status === "active" || x.status === "resolved" || x.status === "alleged"
                ? x.status
                : "alleged",
            source_url: typeof x.source_url === "string" ? x.source_url : undefined,
          };
        })
      : [],
    other_indicators: Array.isArray(parsed.other_indicators)
      ? parsed.other_indicators.map((o: unknown) => {
          const x = o as Record<string, unknown>;
          return {
            category: typeof x.category === "string" ? x.category : "other",
            description: typeof x.description === "string" ? x.description : "",
            source_url: typeof x.source_url === "string" ? x.source_url : undefined,
          };
        })
      : [],
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
}

/**
 * Fetch from Tavily and summarize with Gemini; persist to cache.
 */
export async function fetchAndSummarizeVendor(
  vendorName: string,
  vendorId?: string
): Promise<StructuredVendorRisk> {
  const vid = vendorId ?? vendorKey("", vendorName);

  try {
    const queries = [
      `${vendorName} company background profile`,
      `${vendorName} fraud scam legal issues risk`,
    ];
    const allResults: unknown[] = [];
    for (const q of queries) {
      const results = await tavilySearch(q, 3);
      allResults.push(...results);
    }

    const enrichment = await summarizeWithGemini(vendorName, vid, allResults);

    const supabase = getServiceSupabaseClient();
    await supabase.from("vendor_enrichment_cache").upsert(
      {
        vendor_key: vid,
        enrichment: enrichment as unknown as object,
        last_refreshed_at: new Date().toISOString(),
      },
      { onConflict: "vendor_key" }
    );

    return enrichment;
  } catch (err) {
    console.warn("[tavily] Enrichment failed for vendor:", vendorName, err);
    const minimal = buildMinimalEnrichment(
      vid,
      vendorName,
      err instanceof Error ? err.message : "Enrichment failed"
    );
    return minimal;
  }
}

/**
 * Enrich a list of vendors: use cache when fresh, otherwise Tavily + Gemini; return array of StructuredVendorRisk.
 */
export async function enrichVendors(
  vendorList: { id: string; name: string }[]
): Promise<StructuredVendorRisk[]> {
  const out: StructuredVendorRisk[] = [];

  for (const v of vendorList) {
    const key = vendorKey(v.id, v.name);
    const cached = await getCachedEnrichment(key);
    if (cached) {
      out.push(cached);
      continue;
    }
    const enrichment = await fetchAndSummarizeVendor(v.name, v.id || key);
    out.push(enrichment);
  }

  return out;
}
