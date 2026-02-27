import "./loadEnv";
import {
  runIngestionForPendingDocuments,
  runRetrievalForPendingJobs,
} from "./orchestrator";

const POLL_INTERVAL_MS = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? "10000");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// eslint-disable-next-line no-console
console.log("[worker] Started; SUPABASE_URL:", supabaseUrl ? `${supabaseUrl.slice(0, 30)}...` : "(not set)");

async function main() {
  // Simple polling loop: ingestion then retrieval jobs
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-console
      console.log("[worker] Checking for pending documents and retrieval jobs...");
      await runIngestionForPendingDocuments();
      await runRetrievalForPendingJobs();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[worker] Unhandled error in worker loop", error);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

void main();

