import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceSupabaseClient();

  const params = await context.params;

  const { data, error } = await supabase
    .from("documents")
    .select("status, error_message, created_at")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch document status", details: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      status: data.status,
      errorMessage: data.error_message,
      createdAt: data.created_at,
    },
    { status: 200 },
  );
}

