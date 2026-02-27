import { getServiceSupabaseClient } from "../lib/supabaseClient";
import { runIngestionAgent } from "../lib/agents/ingestionAgent";
import { runRetrievalAgent } from "../lib/agents/retrievalAgent";
import { runExtractionAgent } from "../lib/agents/extractionAgent";
import { persistExtractionToNeo4j } from "../lib/agents/persistExtraction";
import { runReasoningAgent } from "../lib/agents/reasoningAgent";
import { enrichVendors } from "../lib/agents/tavilyEnrichment";
import {
  runExecutionAgent,
  buildExecutionOutput,
} from "../lib/agents/executionAgent";
import {
  persistIngestionOutput,
  markDocumentError,
} from "../lib/agents/persistIngestion";

const REPORTS_BUCKET = "reports";

const MAX_BATCH = 5;
const MAX_RETRIEVAL_JOBS = 3;
const MAX_ANALYSIS_JOBS = 2;

export async function runIngestionForPendingDocuments() {
  const supabase = getServiceSupabaseClient();

  const { data: pending, error } = await supabase
    .from("documents")
    .select("id, filename, mime_type, storage_path, user_id, status")
    .eq("status", "uploaded")
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    console.error("Failed to fetch pending documents", error.message);
    return;
  }

  if (!pending || pending.length === 0) {
    const { data: all } = await supabase
      .from("documents")
      .select("status");
    const total = all?.length ?? 0;
    const byStatus = (all ?? []).reduce(
      (acc: Record<string, number>, row: { status: string }) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    // eslint-disable-next-line no-console
    console.log(
      "[worker] No pending documents. Total:",
      total,
      "by status:",
      JSON.stringify(byStatus),
    );
    return;
  }

  for (const doc of pending) {
    const documentId = doc.id as string;
    try {
      const { error: statusError } = await supabase
        .from("documents")
        .update({
          status: "ingesting",
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      if (statusError) {
        console.error("Failed to mark document as ingesting", statusError.message);
        continue;
      }

      const output = await runIngestionAgent({
        documentId,
        storagePath: doc.storage_path as string,
        mimeType: doc.mime_type as string,
        userId: (doc.user_id as string | null) ?? null,
      });

      await persistIngestionOutput(output);
    } catch (ingestionError) {
      const message =
        ingestionError instanceof Error
          ? ingestionError.message
          : "Unknown ingestion error";
      console.error("Ingestion error", { documentId, message });
      await markDocumentError(documentId, message);
    }
  }
}

export async function runRetrievalForPendingJobs() {
  const supabase = getServiceSupabaseClient();

  const { data: pending, error } = await supabase
    .from("jobs")
    .select("id, payload")
    .eq("type", "retrieval")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_RETRIEVAL_JOBS);

  if (error) {
    console.error("Failed to fetch pending retrieval jobs", error.message);
    return;
  }

  if (!pending || pending.length === 0) {
    return;
  }

  for (const job of pending) {
    const jobId = job.id as string;
    const payload = (job.payload as { intent: string; documentIds?: string[]; debug?: boolean }) ?? {};

    try {
      const { error: updateError } = await supabase
        .from("jobs")
        .update({
          status: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (updateError) {
        console.error("Failed to mark job as processing", updateError.message);
        continue;
      }

      const output = await runRetrievalAgent({
        intent: payload.intent ?? "",
        documentIds: payload.documentIds,
        debug: payload.debug,
      });

      const { error: resultError } = await supabase
        .from("jobs")
        .update({
          status: "completed",
          result: output,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (resultError) {
        console.error("Failed to persist retrieval result", resultError.message);
      }
    } catch (retrievalError) {
      const message =
        retrievalError instanceof Error
          ? retrievalError.message
          : "Unknown retrieval error";
      console.error("Retrieval error", { jobId, message });
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
  }
}

/**
 * Phase 3+4: Full analysis pipeline — Retrieval → Extraction → Neo4j → Reasoning → Tavily → Execution.
 * Picks up jobs with type='analysis' and status='pending'.
 */
export async function runAnalysisForPendingJobs() {
  const supabase = getServiceSupabaseClient();

  const { data: pending, error } = await supabase
    .from("jobs")
    .select("id, payload")
    .eq("type", "analysis")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_ANALYSIS_JOBS);

  if (error) {
    console.error("Failed to fetch pending analysis jobs", error.message);
    return;
  }

  if (!pending || pending.length === 0) {
    return;
  }

  for (const job of pending) {
    const jobId = job.id as string;
    const payload = (job.payload as { intent: string; documentIds?: string[] }) ?? {};
    const intent = payload.intent ?? "";

    try {
      // Mark as processing
      await supabase
        .from("jobs")
        .update({
          status: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      console.log(`[analysis] Starting pipeline for job ${jobId}`);

      // Step 1: Retrieval
      console.log(`[analysis] Step 1/6: Retrieval`);
      const retrievalOutput = await runRetrievalAgent({
        intent,
        documentIds: payload.documentIds,
      });

      // Step 2: Extraction
      console.log(`[analysis] Step 2/6: Extraction`);
      const extractionOutput = await runExtractionAgent({
        intent,
        relevantChunks: retrievalOutput.relevantChunks,
      });

      // Step 3: Neo4j Write
      console.log(`[analysis] Step 3/6: Neo4j Write`);
      await persistExtractionToNeo4j(extractionOutput, jobId);

      // Step 4: Reasoning
      console.log(`[analysis] Step 4/6: Reasoning`);
      const reasoningOutput = await runReasoningAgent({
        intent,
        extraction: extractionOutput,
      });

      // Step 5: Tavily enrichment (once per unique vendor; cache 24h)
      let vendorRiskEnrichment: Awaited<ReturnType<typeof enrichVendors>> = [];
      try {
        console.log(`[analysis] Step 5/6: Tavily enrichment`);
        if (extractionOutput.vendors.length > 0) {
          vendorRiskEnrichment = await enrichVendors(extractionOutput.vendors);
          console.log(`[analysis] Tavily: ${vendorRiskEnrichment.length} vendor(s) enriched`);
        }
      } catch (tavilyErr) {
        console.warn("[analysis] Tavily enrichment failed, continuing without", tavilyErr);
      }

      // Step 6: Execution (CSV, Markdown, email, JSON)
      console.log(`[analysis] Step 6/6: Execution`);
      const rawExecution = await runExecutionAgent({
        intent,
        reasoning: reasoningOutput,
        extraction: extractionOutput,
        vendorRiskEnrichment,
      });

      // Upload CSV to storage
      const csvStoragePath = `${jobId}/report.csv`;
      const { error: uploadError } = await supabase.storage
        .from(REPORTS_BUCKET)
        .upload(csvStoragePath, rawExecution.csvContent, {
          contentType: "text/csv",
          upsert: true,
        });

      if (uploadError) {
        console.error("[analysis] CSV upload failed", uploadError.message);
        throw new Error(`CSV upload failed: ${uploadError.message}`);
      }

      const csvUrl = `/api/jobs/${jobId}/download/csv`;
      const execution = buildExecutionOutput(rawExecution, csvUrl);
      const executionWithPath = {
        ...execution,
        csvStoragePath,
      };

      const combinedResult = {
        extraction: extractionOutput,
        reasoning: reasoningOutput,
        execution: executionWithPath,
        ...(vendorRiskEnrichment.length > 0 && { vendor_risk_enrichment: vendorRiskEnrichment }),
      };

      const { error: resultError } = await supabase
        .from("jobs")
        .update({
          status: "completed",
          result: combinedResult,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (resultError) {
        console.error("Failed to persist analysis result", resultError.message);
      }

      console.log(`[analysis] Job ${jobId} completed successfully`);
    } catch (analysisError) {
      const message =
        analysisError instanceof Error
          ? analysisError.message
          : "Unknown analysis error";
      console.error("[analysis] Error", { jobId, message });
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
  }
}
