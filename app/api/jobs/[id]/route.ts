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
    .from("jobs")
    .select("id, type, status, result, error, created_at, updated_at")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch job", details: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      id: data.id,
      type: data.type,
      status: data.status,
      result: data.result,
      error: data.error,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
    { status: 200 },
  );
}
