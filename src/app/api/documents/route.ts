import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// ============================================================
// Document Upload API — Handles PDF upload to Supabase Storage
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const title = formData.get("title") as string;
    const docNumber = formData.get("doc_number") as string;
    const equipmentModel = formData.get("equipment_model") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Upload file to Supabase Storage
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("manuals")
      .upload(filePath, file, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 2. Create document record
    const { data: doc, error: dbError } = await supabase
      .from("documents")
      .insert({
        title: title || file.name.replace(".pdf", ""),
        doc_number: docNumber || null,
        equipment_model: equipmentModel || null,
        file_path: filePath,
        status: "UPLOADED",
        doc_type: "manual",
        language: "en",
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB error:", dbError);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      document: doc,
      message: "Document uploaded successfully. Start processing to ingest into knowledge base.",
    });
  } catch (error) {
    console.error("Upload handler error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: List all documents
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ documents: data });
  } catch (error) {
    console.error("List documents error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
