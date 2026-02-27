import "./loadEnv";
import {
  runIngestionForPendingDocuments,
  runRetrievalForPendingJobs,
  runAnalysisForPendingJobs,
} from "./orchestrator";
import { setupNeo4jSchema } from "../lib/neo4j/setupSchema";

const POLL_INTERVAL_MS = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? "10000");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// eslint-disable-next-line no-console
console.log("[worker] Started; SUPABASE_URL:", supabaseUrl ? `${supabaseUrl.slice(0, 30)}...` : "(not set)");

async function main() {
  // One-time Neo4j schema setup
  try {
    await setupNeo4jSchema();
  } catch (err) {
    console.warn("[worker] Neo4j schema setup failed (non-fatal):", err);
  }

  // Simple polling loop: ingestion → retrieval → analysis jobs
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-console
      console.log("[worker] Checking for pending documents, retrieval jobs, and analysis jobs...");
      await runIngestionForPendingDocuments();
      await runRetrievalForPendingJobs();
      await runAnalysisForPendingJobs();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[worker] Unhandled error in worker loop", error);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

void main();

