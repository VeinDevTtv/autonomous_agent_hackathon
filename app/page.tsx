"use client";

import { useEffect, useState } from "react";

type UploadStatus = "idle" | "uploading" | "ingesting" | "ready" | "error";

type DocumentStatus = {
  id: string;
  filename: string;
  status: UploadStatus;
  errorMessage?: string | null;
  createdAt?: string;
};

export default function HomePage() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!documents.length) return;

    const hasPending = documents.some((doc) =>
      ["uploading", "ingesting"].includes(doc.status),
    );
    if (!hasPending) return;

    const interval = setInterval(async () => {
      const next = await Promise.all(
        documents.map(async (doc) => {
          if (!["uploading", "ingesting"].includes(doc.status)) return doc;
          try {
            const res = await fetch(`/api/documents/${doc.id}/status`);
            if (!res.ok) return doc;
            const data = (await res.json()) as {
              status: UploadStatus;
              errorMessage?: string | null;
              createdAt?: string;
            };
            return {
              ...doc,
              status: data.status,
              errorMessage: data.errorMessage,
              createdAt: data.createdAt ?? doc.createdAt,
            };
          } catch {
            return doc;
          }
        }),
      );
      setDocuments(next);
    }, 2500);

    return () => clearInterval(interval);
  }, [documents]);

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(event.target.files);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!files || !files.length) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = (await res.json()) as {
        documents: { id: string; filename: string }[];
      };

      setDocuments((prev) => [
        ...prev,
        ...data.documents.map((doc) => ({
          id: doc.id,
          filename: doc.filename,
          status: "uploading" as UploadStatus,
        })),
      ]);
      setFiles(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStatusChip = (status: UploadStatus) => {
    switch (status) {
      case "uploading":
        return <span className="chip chip-pill">Uploading</span>;
      case "ingesting":
        return <span className="chip chip-warn">Ingesting</span>;
      case "ready":
        return <span className="chip chip-success">Ready</span>;
      case "error":
        return <span className="chip chip-error">Error</span>;
      default:
        return <span className="chip chip-pill">Idle</span>;
    }
  };

  return (
    <div className="stack">
      <section className="card subtle-shadow">
        <div className="stack" style={{ padding: "1.5rem 1.5rem 1.75rem" }}>
          <div className="stack-tight">
            <div className="pill-row">
              <span className="chip chip-pill">Phase 1 · Upload &amp; Ingest</span>
            </div>
            <div className="title">Upload your invoices and contracts</div>
            <p className="muted">
              We&apos;ll store your documents securely in Supabase, then an
              ingestion worker will run OCR, chunking, and embeddings with
              Gemini before later phases analyze them.
            </p>
          </div>

          <form className="stack" onSubmit={handleSubmit}>
            <div className="stack-tight file-input">
              <label className="muted" htmlFor="file-input">
                Files
              </label>
              <label className="file-dropzone">
                <input
                  id="file-input"
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={handleFilesChange}
                />
                <div className="stack-tight">
                  <div className="row">
                    <div>
                      <div className="status-name">
                        Drag &amp; drop invoices and contracts
                      </div>
                      <p className="status-meta">
                        PDFs and images are supported. These will be uploaded to
                        Supabase Storage and queued for ingestion.
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="button-primary"
                      disabled={!files || !files.length || isSubmitting}
                    >
                      {isSubmitting ? "Uploading..." : "Upload & queue ingestion"}
                    </button>
                  </div>
                  {files && files.length > 0 && (
                    <p className="status-meta">
                      Selected {files.length} file
                      {files.length > 1 ? "s" : ""}.
                    </p>
                  )}
                </div>
              </label>
            </div>
          </form>
        </div>
      </section>

      <section className="surface subtle-shadow" style={{ padding: "1.25rem" }}>
        <div className="stack-tight">
          <div className="row">
            <div>
              <div className="title" style={{ fontSize: "1rem" }}>
                Ingestion jobs
              </div>
              <p className="status-meta">
                As documents move through the pipeline, their status will update
                here.
              </p>
            </div>
          </div>

          <div className="status-list">
            {documents.length === 0 ? (
              <p className="status-meta">
                No documents yet. Upload invoices or contracts to kick off
                ingestion.
              </p>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="status-item">
                  <div className="stack-tight" style={{ flex: 1 }}>
                    <div className="status-name">{doc.filename}</div>
                    <div className="status-meta">
                      {doc.createdAt
                        ? `Created at ${new Date(doc.createdAt).toLocaleString()}`
                        : "Queued"}
                    </div>
                    {doc.errorMessage && (
                      <div className="status-error-text">
                        {doc.errorMessage}
                      </div>
                    )}
                  </div>
                  {renderStatusChip(doc.status)}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

