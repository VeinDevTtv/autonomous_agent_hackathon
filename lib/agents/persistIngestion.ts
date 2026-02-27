import { getServiceSupabaseClient } from "../supabaseClient";
import type { IngestionAgentOutput } from "./types";

export async function persistIngestionOutput(output: IngestionAgentOutput) {
  const supabase = getServiceSupabaseClient();

  const { error: chunksError } = await supabase.from("document_chunks").insert(
    output.chunks.map((chunk) => ({
      id: chunk.id,
      document_id: output.documentId,
      chunk_id: chunk.id,
      text: chunk.text,
      embedding: chunk.embedding,
    })),
  );

  if (chunksError) {
    throw new Error(`Failed to insert document chunks: ${chunksError.message}`);
  }

  const { error: statusError } = await supabase
    .from("documents")
    .update({
      status: "ready",
      updated_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", output.documentId);

  if (statusError) {
    throw new Error(`Failed to update document status: ${statusError.message}`);
  }
}

export async function markDocumentError(documentId: string, message: string) {
  const supabase = getServiceSupabaseClient();
  await supabase
    .from("documents")
    .update({
      status: "error",
      updated_at: new Date().toISOString(),
      error_message: message.slice(0, 2000),
    })
    .eq("id", documentId);
}

