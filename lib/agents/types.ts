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

