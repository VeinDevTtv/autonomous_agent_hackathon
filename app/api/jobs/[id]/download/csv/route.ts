import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";

const BUCKET = "reports";
const SIGNED_URL_EXPIRY_SEC = 3600; // 1 hour

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceSupabaseClient();
  const params = await context.params;
  const jobId = params.id;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, type, status, result")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json(
      { error: "Job not found", details: jobError?.message },
      { status: 404 },
    );
  }

  if (job.status !== "completed" || !job.result) {
    return NextResponse.json(
      { error: "Job not completed or no result" },
      { status: 400 },
    );
  }

  const result = job.result as Record<string, unknown>;
  const execution = result?.execution as Record<string, unknown> | undefined;
  const csvStoragePath = execution?.csvStoragePath as string | undefined;

  if (!csvStoragePath || typeof csvStoragePath !== "string") {
    return NextResponse.json(
      { error: "No CSV available for this job" },
      { status: 404 },
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(csvStoragePath, SIGNED_URL_EXPIRY_SEC);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to create download link", details: signError?.message },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
