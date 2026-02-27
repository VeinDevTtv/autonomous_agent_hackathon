import "dotenv/config";
import { randomUUID } from "crypto";
import { getServiceSupabaseClient } from "../lib/supabaseClient";
import { getGeminiClient } from "../lib/ai/geminiClient";
import { runIngestionAgent } from "../lib/agents/ingestionAgent";
import {
  persistIngestionOutput,
  markDocumentError,
} from "../lib/agents/persistIngestion";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EXPECTED_EMBEDDING_DIMENSION = 3072;

async function validatePgvectorAndIngestion() {
  const supabase = getServiceSupabaseClient();
  const gemini = getGeminiClient() as any;

  // #region agent log
  void fetch(
    "http://127.0.0.1:7518/ingest/eed14813-954a-4107-9a12-1313307b9e8f",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "ddfad8",
      },
      body: JSON.stringify({
        sessionId: "ddfad8",
        runId: "phase1-validation",
        hypothesisId: "H1",
        location: "worker/phase1Validation.ts:18",
        message: "Phase 1 validation started",
        data: {},
        timestamp: Date.now(),
      }),
    },
  ).catch(() => {});
  // #endregion agent log

  // 1) Create a small sample "invoice" and upload it to Supabase Storage
  const documentId = randomUUID();
  const filename = "phase1-validation-invoice.txt";
  const storagePath = `validation/${documentId}/${filename}`;
  const invoiceText =
    "ACME Corp Invoice #12345\nTotal: $1,234.56\nDue Date: 2026-03-31\nThank you for your business.";

  // Upload to the 'documents' storage bucket
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, Buffer.from(invoiceText, "utf8"), {
      contentType: "text/plain",
    });

  if (uploadError) {
    throw new Error(
      `Phase 1 validation: failed to upload sample invoice to storage: ${uploadError.message}`,
    );
  }

  // Create a matching row in public.documents with status 'uploaded'
  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    user_id: null,
    filename,
    mime_type: "text/plain",
    storage_path: storagePath,
    status: "uploaded",
  });

  if (insertError) {
    throw new Error(
      `Phase 1 validation: failed to insert sample document row: ${insertError.message}`,
    );
  }

  // 2) Run the ingestion agent directly and persist its output
  let ingestionSucceeded = false;
  try {
    const output = await runIngestionAgent({
      documentId,
      storagePath,
      mimeType: "text/plain",
      userId: null,
    });

    await persistIngestionOutput(output);
    ingestionSucceeded = true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error running ingestion agent";
    await markDocumentError(documentId, message);
    throw new Error(`Phase 1 validation: ingestion failed: ${message}`);
  }

  // 3) Verify chunks and embeddings were stored
  const {
    data: chunks,
    error: chunksError,
  } = await supabase
    .from("document_chunks")
    .select("id, document_id, text, embedding")
    .eq("document_id", documentId);

  if (chunksError) {
    throw new Error(
      `Phase 1 validation: failed to fetch document chunks: ${chunksError.message}`,
    );
  }

  if (!chunks || chunks.length === 0) {
    throw new Error(
      "Phase 1 validation: no chunks were stored for the sample document",
    );
  }

  const firstChunk = chunks[0] as {
    id: string;
    document_id: string;
    text: string;
    embedding: number[];
  };

  if (!Array.isArray(firstChunk.embedding)) {
    throw new Error(
      "Phase 1 validation: first chunk embedding is not an array",
    );
  }

  if (firstChunk.embedding.length !== EXPECTED_EMBEDDING_DIMENSION) {
    throw new Error(
      `Phase 1 validation: stored chunk embedding dimension (${firstChunk.embedding.length}) does not match expected dimension (${EXPECTED_EMBEDDING_DIMENSION})`,
    );
  }

  // 4) Generate a test query embedding and confirm the dimension matches
  const queryText =
    "ACME Corp invoice with total amount around $1,234.56 and due date in March 2026.";

  const embeddingResponse = await gemini.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: queryText }],
      },
    ],
  });

  const queryEmbedding: number[] | undefined =
    embeddingResponse.embeddings?.[0]?.values;

  if (!queryEmbedding || queryEmbedding.length === 0) {
    throw new Error(
      "Phase 1 validation: Gemini returned an empty query embedding",
    );
  }

  if (queryEmbedding.length !== EXPECTED_EMBEDDING_DIMENSION) {
    throw new Error(
      `Phase 1 validation: Gemini query embedding dimension (${queryEmbedding.length}) does not match expected dimension (${EXPECTED_EMBEDDING_DIMENSION})`,
    );
  }

  // 5) Call the match_documents RPC and verify the sample document comes back as a top match
  const {
    data: matches,
    error: matchError,
  } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: 5,
  });

  if (matchError) {
    throw new Error(
      `Phase 1 validation: match_documents RPC failed: ${matchError.message}`,
    );
  }

  if (!matches || matches.length === 0) {
    throw new Error(
      "Phase 1 validation: match_documents RPC returned no matches",
    );
  }

  const topMatch = matches[0] as {
    id: string;
    document_id: string;
    chunk_id: string;
    text: string;
    similarity: number;
  };

  if (topMatch.document_id !== documentId) {
    throw new Error(
      `Phase 1 validation: top match document_id (${topMatch.document_id}) does not match validation documentId (${documentId})`,
    );
  }

  if (typeof topMatch.similarity !== "number" || topMatch.similarity <= 0) {
    throw new Error(
      `Phase 1 validation: top match similarity (${topMatch.similarity}) is not a positive number`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    "[phase1-validation] Success. Ingestion, embeddings, and match_documents RPC all passed.",
    {
      documentId,
      ingestionSucceeded,
      chunkCount: chunks.length,
      embeddingDimension: firstChunk.embedding.length,
      queryEmbeddingDimension: queryEmbedding.length,
      topMatchSimilarity: topMatch.similarity,
    },
  );
}

void validatePgvectorAndIngestion()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("[phase1-validation] Completed successfully.");
    process.exitCode = 0;
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("[phase1-validation] FAILED", error);
    process.exitCode = 1;
  });

