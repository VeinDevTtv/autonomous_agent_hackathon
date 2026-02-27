import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { getServiceSupabaseClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const supabase = getServiceSupabaseClient();

  // Supabase health: simple metadata query against documents
  let supabaseOk = false;
  let supabaseError: string | null = null;

  try {
    const { error } = await supabase
      .from("documents")
      .select("id")
      .limit(1);
    if (!error) {
      supabaseOk = true;
    } else {
      supabaseError = error.message;
    }
  } catch (error) {
    supabaseError =
      error instanceof Error ? error.message : "Unknown Supabase error";
  }

  // Gemini health: check API key presence only (no network call)
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiConfigured = !!geminiKey && geminiKey.length > 0;
  const geminiOk = geminiConfigured;
  const geminiError = geminiConfigured ? null : "Missing GEMINI_API_KEY";

  // Neo4j health: only attempt a connection if all env vars are present
  const neo4jUri = process.env.NEO4J_URI;
  const neo4jUser = process.env.NEO4J_USERNAME;
  const neo4jPassword = process.env.NEO4J_PASSWORD;

  const neo4jConfigured =
    !!neo4jUri && neo4jUri.length > 0 && !!neo4jUser && !!neo4jPassword;

  let neo4jOk = false;
  let neo4jError: string | null = null;

  if (neo4jConfigured) {
    try {
      const driver = neo4j.driver(
        neo4jUri as string,
        neo4j.auth.basic(neo4jUser as string, neo4jPassword as string),
      );
      const session = driver.session();
      await session.run("RETURN 1 as ok");
      await session.close();
      await driver.close();
      neo4jOk = true;
    } catch (error) {
      neo4jError =
        error instanceof Error ? error.message : "Unknown Neo4j error";
    }
  }

  const ok =
    supabaseOk && (!neo4jConfigured || neo4jOk) && (!geminiConfigured || geminiOk);

  const body = {
    ok,
    supabase: {
      ok: supabaseOk,
      error: supabaseError,
    },
    gemini: {
      configured: geminiConfigured,
      ok: geminiOk,
      error: geminiError,
    },
    neo4j: {
      configured: neo4jConfigured,
      ok: neo4jOk,
      error: neo4jError,
    },
  };

  return NextResponse.json(body, {
    status: ok ? 200 : 500,
  });
}

