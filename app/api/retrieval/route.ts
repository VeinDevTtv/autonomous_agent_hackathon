import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const intent = typeof body?.intent === "string" ? body.intent.trim() : "";
    const debug = body?.debug === true;

    if (!intent) {
      return NextResponse.json(
        { error: "Missing or empty intent" },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        type: "retrieval",
        status: "pending",
        payload: { intent, debug },
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to create retrieval job", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ jobId: data.id }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
