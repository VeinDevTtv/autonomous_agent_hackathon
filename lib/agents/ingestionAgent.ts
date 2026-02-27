import { getServiceSupabaseClient } from "../supabaseClient";
import { getGeminiClient } from "../ai/geminiClient";
import {
  type IngestionAgentInput,
  type IngestionAgentOutput,
  type IngestionAgentChunk,
} from "./types";
import { randomUUID } from "crypto";

const TEXT_MODEL = "gemini-2.0-flash";
const EMBEDDING_MODEL = "gemini-embedding-001";

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function chunkText(text: string, maxChars = 1500, overlap = 200): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks;
}

export async function runIngestionAgent(
  input: IngestionAgentInput,
): Promise<IngestionAgentOutput> {
  const supabase = getServiceSupabaseClient();
  const gemini = getGeminiClient() as any;

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("documents")
    .download(input.storagePath);

  if (downloadError || !fileData) {
    throw new Error(
      `Failed to download document from storage: ${downloadError?.message ?? "unknown error"}`,
    );
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let fullText: string;

  if (input.mimeType.startsWith("text/")) {
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
          hypothesisId: "H2",
          location: "lib/agents/ingestionAgent.ts:40",
          message: "Using text-only ingestion path",
          data: { mimeType: input.mimeType },
          timestamp: Date.now(),
        }),
      },
    ).catch(() => {});
    // #endregion agent log

    const decoder = new TextDecoder("utf-8");
    fullText = normalizeText(decoder.decode(bytes));
  } else {
    const upload = await gemini.files.upload({
      file: {
        data: bytes,
        mimeType: input.mimeType,
        displayName: input.storagePath,
      },
    });

    const filePart = {
      fileData: {
        mimeType: upload.file.mimeType,
        fileUri: upload.file.uri,
      },
    };

    const result = await gemini.models.generateContent({
      model: TEXT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Extract clean, machine-readable text from this document. Do not summarize or omit details.",
            },
            filePart,
          ],
        },
      ],
    });

    fullText = normalizeText(result.text ?? "");
  }
  if (!fullText) {
    throw new Error("Gemini returned empty text for document");
  }

  const segments = chunkText(fullText);

  const embeddingResponse = await gemini.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: segments.map((segment) => ({
      role: "user",
      parts: [{ text: segment }],
    })),
  });

  const embeddings = embeddingResponse.embeddings;
  if (!embeddings || embeddings.length !== segments.length) {
    throw new Error("Embedding count did not match chunk count");
  }

  const chunks: IngestionAgentChunk[] = segments.map((segment, index) => ({
    id: randomUUID(),
    text: segment,
    embedding: embeddings[index].values ?? [],
  }));

  return {
    documentId: input.documentId,
    chunks,
  } satisfies IngestionAgentOutput;
}

