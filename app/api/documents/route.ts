import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const supabase = getServiceSupabaseClient();

  const { data, error } = await supabase
    .from("documents")
    .select("id, filename, status, error_message, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch documents", details: error.message },
      { status: 500 },
    );
  }

  const documents = (data ?? []).map((row) => ({
    id: row.id,
    filename: row.filename,
    status: row.status,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at ?? null,
  }));

  return NextResponse.json({ documents }, { status: 200 });
}
