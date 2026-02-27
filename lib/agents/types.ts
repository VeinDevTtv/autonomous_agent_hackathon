export interface IngestionAgentChunk {
  id: string;
  text: string;
  embedding: number[];
  chunkIndex: number;
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
  debug?: boolean;
}

export interface RetrievalAgentOutput {
  relevantChunks: Array<{
    chunkId: string;
    text: string;
    similarity: number;
    documentId?: string;
    chunkIndex?: number;
  }>;
}

// --- Phase 3: Extraction & Reasoning ---

// Shared chunk reference used as input
export type RelevantChunk = {
  chunkId: string;
  text: string;
  similarity: number;
};

// Entity types
export interface ExtractedVendor {
  id: string;
  name: string;
  address?: string;
  contactEmail?: string;
}

export interface ExtractedInvoice {
  id: string;
  number: string;
  vendorName: string;
  amount: number;
  currency: string;
  date: string;
  dueDate?: string;
  description?: string;
}

export interface ExtractedContract {
  id: string;
  title: string;
  parties: string[];
  effectiveDate?: string;
  expirationDate?: string;
  value?: number;
}

export interface ExtractedClause {
  id: string;
  contractId?: string;
  type: string; // e.g. "liability", "indemnity", "termination"
  text: string;
}

export interface ExtractedAmount {
  id: string;
  value: number;
  currency: string;
  context: string; // where this amount appears
  sourceEntityId?: string;
}

// Extraction Agent
export interface ExtractionAgentInput {
  intent: string;
  relevantChunks: RelevantChunk[];
}

export interface ExtractionAgentOutput {
  vendors: ExtractedVendor[];
  invoices: ExtractedInvoice[];
  contracts: ExtractedContract[];
  clauses: ExtractedClause[];
  amounts: ExtractedAmount[];
}

// Reasoning Agent
export interface ReasoningAgentInput {
  intent: string;
  extraction: ExtractionAgentOutput;
}

export interface VendorTotal {
  vendorName: string;
  totalAmount: number;
  currency: string;
  invoiceCount: number;
}

export interface FlaggedInvoice {
  invoiceId: string;
  number: string;
  vendorName: string;
  amount: number;
  reason: string;
}

export interface ClauseComparison {
  clauseType: string;
  clauses: Array<{
    contractTitle: string;
    text: string;
  }>;
  analysis: string;
}

export interface ReasoningAgentOutput {
  totalsByVendor: VendorTotal[];
  flaggedInvoices: FlaggedInvoice[];
  clauseComparisons: ClauseComparison[];
  actionPlan: string;
}
