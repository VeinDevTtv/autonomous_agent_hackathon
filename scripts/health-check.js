#!/usr/bin/env node
/**
 * Quick health check for Smart Document Filler (local or Render).
 * Usage: node scripts/health-check.js [BASE_URL]
 * Example: node scripts/health-check.js https://smart-document-filler-web.onrender.com
 */

const base = process.argv[2] || "http://localhost:3000";
const url = base.replace(/\/$/, "") + "/api/health";

async function main() {
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    if (res.ok && data.ok) {
      console.log("\n✓ Health check passed.");
      process.exit(0);
    }
    console.log("\n✗ Health check failed (ok: false or non-200).");
    process.exit(1);
  } catch (err) {
    console.error("Request failed:", err.message);
    process.exit(1);
  }
}

main();
