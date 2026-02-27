export interface IngestionAgentChunk {
  id: string;
  text: string;
  embedding: number[];
}

export interface IngestionAgentOutput {
  documentId: string;
  chunks: IngestionAgentChunk[];
}

export interface IngestionAgentInput {
  documentId: string;
  storagePath: string;
  mimeType: string;
  userId?: string | null;
}

export interface RetrievalAgentInput {
  intent: string;
  documentIds?: string[];
}

export interface RetrievalAgentOutput {
  relevantChunks: Array<{
    chunkId: string;
    text: string;
    similarity: number;
  }>;
}

