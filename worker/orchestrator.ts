import { getServiceSupabaseClient } from "../lib/supabaseClient";
import { runIngestionAgent } from "../lib/agents/ingestionAgent";
import { runRetrievalAgent } from "../lib/agents/retrievalAgent";
import {
  persistIngestionOutput,
  markDocumentError,
} from "../lib/agents/persistIngestion";

const MAX_BATCH = 5;
const MAX_RETRIEVAL_JOBS = 3;

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
    const payload = (job.payload as { intent: string; documentIds?: string[] }) ?? {};

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

