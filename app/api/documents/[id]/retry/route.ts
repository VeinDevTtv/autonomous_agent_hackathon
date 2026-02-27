import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";

export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const supabase = getServiceSupabaseClient();
    const params = await context.params;

    // Only allow retrying errored documents
    const { data: doc, error: fetchError } = await supabase
        .from("documents")
        .select("status")
        .eq("id", params.id)
        .maybeSingle();

    if (fetchError) {
        return NextResponse.json(
            { error: "Failed to fetch document", details: fetchError.message },
            { status: 500 },
        );
    }

    if (!doc) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.status !== "error") {
        return NextResponse.json(
            { error: "Only errored documents can be retried" },
            { status: 400 },
        );
    }

    const { error: updateError } = await supabase
        .from("documents")
        .update({
            status: "uploaded",
            error_message: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", params.id);

    if (updateError) {
        return NextResponse.json(
            { error: "Failed to reset document", details: updateError.message },
            { status: 500 },
        );
    }

    return NextResponse.json({ status: "uploaded" }, { status: 200 });
}
