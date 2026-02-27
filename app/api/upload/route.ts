import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseClient";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files").filter((value) => value instanceof File) as File[];

    if (!files.length) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabaseClient();
    const uploadedDocs: { id: string; filename: string }[] = [];

    for (const file of files) {
      const id = randomUUID();
      const safeName = file.name || "document";
      const storagePath = `anonymous/${id}/${safeName}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        console.error("[upload] Storage error for", safeName, uploadError);
        return NextResponse.json(
          { error: `Failed to upload ${safeName}`, details: uploadError.message },
          { status: 500 },
        );
      }

      const { error: insertError } = await supabase.from("documents").insert({
        id,
        user_id: null,
        filename: safeName,
        mime_type: file.type || "application/octet-stream",
        storage_path: storagePath,
        status: "uploaded",
      });

      if (insertError) {
        console.error("[upload] Insert error for", safeName, insertError);
        return NextResponse.json(
          { error: "Failed to create document record", details: insertError.message },
          { status: 500 },
        );
      }

      uploadedDocs.push({ id, filename: safeName });
    }

    return NextResponse.json({ documents: uploadedDocs }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected error while uploading files" },
      { status: 500 },
    );
  }
}

