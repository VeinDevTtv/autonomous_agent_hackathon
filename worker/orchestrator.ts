import { getServiceSupabaseClient } from "../lib/supabaseClient";
import { runIngestionAgent } from "../lib/agents/ingestionAgent";
import {
  persistIngestionOutput,
  markDocumentError,
} from "../lib/agents/persistIngestion";

const MAX_BATCH = 5;

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

