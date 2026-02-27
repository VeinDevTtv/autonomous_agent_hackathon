/**
 * Load .env from project root so the worker uses the same env regardless of cwd.
 * Load .env first, then .env.local (overrides), matching Next.js order.
 * Must be imported first in the worker entry (before orchestrator).
 */
import path from "path";
import dotenv from "dotenv";

declare const __dirname: string;
const root = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });
