import { getServiceSupabaseClient } from "../supabaseClient";
import { getGeminiClient } from "../ai/geminiClient";
import { createPartFromUri } from "@google/genai";
import {
  type IngestionAgentInput,
  type IngestionAgentOutput,
  type IngestionAgentChunk,
} from "./types";
import { randomUUID } from "crypto";

const TEXT_MODEL = "gemini-2.0-flash";
const EMBEDDING_MODEL = "gemini-embedding-001";

function normalizeText(raw: string): string {
  return raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Split text into chunks of roughly maxChars with overlap.
 * Tries to respect paragraph / line boundaries to keep semantic units intact.
 */
function chunkText(text: string, maxChars = 2800, overlap = 500): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    // If not at the very end, try to break on a semantic boundary
    if (end < text.length) {
      const window = text.slice(start, end);

      // Prefer paragraph break
      const lastParaBreak = window.lastIndexOf("\n\n");
      if (lastParaBreak > maxChars * 0.3) {
        end = start + lastParaBreak + 2; // include the \n\n
      } else {
        // Fall back to line break
        const lastLineBreak = window.lastIndexOf("\n");
        if (lastLineBreak > maxChars * 0.3) {
          end = start + lastLineBreak + 1;
        }
        // Otherwise fall back to character-level split at maxChars
      }
    }

    chunks.push(text.slice(start, end).trim());

    if (end >= text.length) break;
    // Overlap: step back so next chunk starts `overlap` chars before `end`
    start = Math.max(end - overlap, start + 1);
  }

  return chunks.filter((c) => c.length > 0);
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
    const decoder = new TextDecoder("utf-8");
    fullText = normalizeText(decoder.decode(bytes));
  } else {
    const blob = new Blob([bytes], { type: input.mimeType });
    const upload = await gemini.files.upload({
      file: blob,
      config: {
        mimeType: input.mimeType,
        displayName: input.storagePath,
      },
    });

    const result = await gemini.models.generateContent({
      model: TEXT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Extract clean, machine-readable text from this document. Do not summarize or omit details.",
            },
            createPartFromUri(upload.uri!, upload.mimeType!),
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

  console.log(
    `[ingestion] Document ${input.documentId}: ${fullText.length} chars → ${segments.length} chunks`,
  );

  const embeddingResponse = await gemini.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: segments,
  });

  const embeddings = embeddingResponse.embeddings;
  if (!embeddings || embeddings.length !== segments.length) {
    throw new Error("Embedding count did not match chunk count");
  }

  const chunks: IngestionAgentChunk[] = segments.map((segment, index) => ({
    id: randomUUID(),
    text: segment,
    embedding: embeddings[index].values ?? [],
    chunkIndex: index,
  }));

  return {
    documentId: input.documentId,
    chunks,
  } satisfies IngestionAgentOutput;
}

