import "dotenv/config";
import { runIngestionForPendingDocuments } from "./orchestrator";

const POLL_INTERVAL_MS = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? "10000");

async function main() {
  // Simple polling loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-console
      console.log("[worker] Checking for pending documents...");
      await runIngestionForPendingDocuments();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[worker] Unhandled error in ingestion loop", error);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

void main();

