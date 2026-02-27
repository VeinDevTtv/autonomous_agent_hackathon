import { getServiceSupabaseClient } from "../supabaseClient";
import { getGeminiClient } from "../ai/geminiClient";
import type {
  RetrievalAgentInput,
  RetrievalAgentOutput,
} from "./types";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EXPECTED_EMBEDDING_DIMENSION = 3072;
const MATCH_COUNT = 10;

export async function runRetrievalAgent(
  input: RetrievalAgentInput,
): Promise<RetrievalAgentOutput> {
  const supabase = getServiceSupabaseClient();
  const gemini = getGeminiClient() as any;

  const intent = (input.intent ?? "").trim();
  if (!intent) {
    throw new Error("Retrieval agent requires a non-empty intent");
  }

  const embeddingResponse = await gemini.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: intent }],
      },
    ],
  });

  const queryEmbedding: number[] | undefined =
    embeddingResponse.embeddings?.[0]?.values;

  if (!queryEmbedding || queryEmbedding.length === 0) {
    throw new Error("Gemini returned an empty query embedding");
  }

  if (queryEmbedding.length !== EXPECTED_EMBEDDING_DIMENSION) {
    throw new Error(
      `Query embedding dimension (${queryEmbedding.length}) does not match expected ${EXPECTED_EMBEDDING_DIMENSION}`,
    );
  }

  const { data: rows, error: matchError } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
  });

  if (matchError) {
    throw new Error(`match_documents RPC failed: ${matchError.message}`);
  }

  type MatchRow = {
    id: string;
    document_id: string;
    chunk_id: string;
    text: string;
    similarity: number;
  };

  let list: MatchRow[] = Array.isArray(rows) ? (rows as MatchRow[]) : [];

  if (input.documentIds && input.documentIds.length > 0) {
    const idSet = new Set(input.documentIds);
    list = list.filter((row) => idSet.has(row.document_id));
  }

  const relevantChunks = list.map((row) => ({
    chunkId: row.chunk_id,
    text: row.text,
    similarity: row.similarity,
  }));

  return { relevantChunks };
}
