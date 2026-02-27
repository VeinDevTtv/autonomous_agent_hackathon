"use client";

import { useEffect, useState } from "react";

type UploadStatus = "idle" | "uploading" | "uploaded" | "ingesting" | "ready" | "error";

type DocumentStatus = {
  id: string;
  filename: string;
  status: UploadStatus;
  errorMessage?: string | null;
  createdAt?: string;
};

type RetrievalJobStatus = "pending" | "processing" | "completed" | "failed";

type RelevantChunk = {
  chunkId: string;
  text: string;
  similarity: number;
};

type RetrievalJobState = {
  jobId: string | null;
  status: RetrievalJobStatus | null;
  result: { relevantChunks: RelevantChunk[] } | null;
  error: string | null;
};

const PENDING_DOC_STATUSES: UploadStatus[] = ["uploaded", "uploading", "ingesting"];

const VALID_STATUSES: UploadStatus[] = [
  "uploaded",
  "uploading",
  "ingesting",
  "ready",
  "error",
  "idle",
];
function toUploadStatus(s: unknown): UploadStatus {
  return typeof s === "string" && VALID_STATUSES.includes(s as UploadStatus)
    ? (s as UploadStatus)
    : "ready";
}

export default function HomePage() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [intent, setIntent] = useState("");
  const [retrievalJob, setRetrievalJob] = useState<RetrievalJobState>({
    jobId: null,
    status: null,
    result: null,
    error: null,
  });
  const [isRetrievalSubmitting, setIsRetrievalSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/documents")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { documents?: Array<{ id: string; filename: string; status?: unknown; errorMessage?: string | null; createdAt?: string | null }> } | null) => {
        if (cancelled || !data?.documents || !Array.isArray(data.documents))
          return;
        setDocuments(
          data.documents.map((doc) => ({
            id: doc.id,
            filename: doc.filename,
            status: toUploadStatus(doc.status),
            errorMessage: doc.errorMessage ?? null,
            createdAt: doc.createdAt ?? undefined,
          })),
        );
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!documents.length) return;

    const hasPending = documents.some((doc) =>
      PENDING_DOC_STATUSES.includes(doc.status),
    );
    if (!hasPending) return;

    const interval = setInterval(async () => {
      const next = await Promise.all(
        documents.map(async (doc) => {
          if (!PENDING_DOC_STATUSES.includes(doc.status)) return doc;
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

  useEffect(() => {
    const jobId = retrievalJob.jobId;
    const status = retrievalJob.status;
    if (!jobId || !status || status === "completed" || status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: RetrievalJobStatus;
          result: { relevantChunks: RelevantChunk[] } | null;
          error: string | null;
        };
        setRetrievalJob((prev) => ({
          ...prev,
          status: data.status,
          result: data.result ?? null,
          error: data.error ?? null,
        }));
      } catch {
        // keep polling
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [retrievalJob.jobId, retrievalJob.status]);

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(event.target.files);
    setUploadError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!files || !files.length) return;

    setIsSubmitting(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as {
        documents?: { id: string; filename: string }[];
        error?: string;
        details?: string;
      };

      if (!res.ok) {
        const message = [data.error, data.details].filter(Boolean).join(" — ") || "Upload failed";
        setUploadError(message);
        return;
      }

      const docs = data.documents;
      if (!docs || !Array.isArray(docs)) {
        console.error("Upload response missing documents array", data);
        setUploadError("Invalid response from server");
        return;
      }

      setDocuments((prev) => [
        ...prev,
        ...docs.map((doc) => ({
          id: doc.id,
          filename: doc.filename,
          status: "uploading" as UploadStatus,
        })),
      ]);
      setFiles(null);
      setFileInputKey((k) => k + 1);
      setUploadSuccess(`✓ Uploaded ${docs.length} file${docs.length > 1 ? "s" : ""} successfully! Queued for ingestion.`);
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (error) {
      console.error(error);
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetrievalSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = intent.trim();
    if (!trimmed || isRetrievalSubmitting) return;

    setIsRetrievalSubmitting(true);
    setRetrievalJob({ jobId: null, status: null, result: null, error: null });
    try {
      const res = await fetch("/api/retrieval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Retrieval request failed");
      }
      const data = (await res.json()) as { jobId: string };
      setRetrievalJob({
        jobId: data.jobId,
        status: "pending",
        result: null,
        error: null,
      });
    } catch (err) {
      setRetrievalJob((prev) => ({
        ...prev,
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    } finally {
      setIsRetrievalSubmitting(false);
    }
  };

  const handleRetry = async (docId: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}/retry`, { method: "POST" });
      if (!res.ok) return;
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === docId
            ? { ...doc, status: "uploaded" as UploadStatus, errorMessage: null }
            : doc,
        ),
      );
    } catch {
      // silently fail
    }
  };

  const renderStatusChip = (status: UploadStatus) => {
    switch (status) {
      case "uploading":
        return <span className="chip chip-pill">Uploading</span>;
      case "uploaded":
        return <span className="chip chip-pill">Queued</span>;
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
              <label className="file-dropzone" htmlFor="file-input">
                <input
                  id="file-input"
                  key={fileInputKey}
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={handleFilesChange}
                />
                <div className="stack-tight">
                  <div className="status-name">
                    Drag &amp; drop invoices and contracts
                  </div>
                  <p className="status-meta">
                    PDFs and images are supported. These will be uploaded to
                    Supabase Storage and queued for ingestion.
                  </p>
                </div>
              </label>

              {files && files.length > 0 && (
                <p className="status-meta">
                  Selected {files.length} file
                  {files.length > 1 ? "s" : ""}.
                </p>
              )}
              {uploadError && (
                <div className="status-error-text" role="alert">
                  {uploadError}
                </div>
              )}
              {uploadSuccess && (
                <div style={{ color: "#22c55e", fontWeight: 500, fontSize: "0.875rem" }} role="status">
                  {uploadSuccess}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="button-primary"
              disabled={!files || !files.length || isSubmitting}
            >
              {isSubmitting ? "Uploading..." : "Upload & queue ingestion"}
            </button>
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
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {doc.status === "error" && (
                      <button
                        className="button-primary"
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.75rem" }}
                        onClick={() => handleRetry(doc.id)}
                      >
                        Retry
                      </button>
                    )}
                    {renderStatusChip(doc.status)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="card subtle-shadow">
        <div className="stack" style={{ padding: "1.5rem 1.5rem 1.75rem" }}>
          <div className="stack-tight">
            <div className="pill-row">
              <span className="chip chip-pill">Phase 2 · Retrieval &amp; Intent</span>
            </div>
            <div className="title">Search your documents by intent</div>
            <p className="muted">
              Enter your goal or question. The worker will embed your intent,
              run vector search, and return the top 10 relevant chunks.
            </p>
          </div>

          <form className="stack" onSubmit={handleRetrievalSubmit}>
            <div className="stack-tight">
              <label className="muted" htmlFor="intent-input">
                Intent
              </label>
              <textarea
                id="intent-input"
                className="input"
                rows={3}
                placeholder="e.g. Summarize vendor totals, find invoices over $5,000"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                disabled={isRetrievalSubmitting}
              />
              <button
                type="submit"
                className="button-primary"
                disabled={!intent.trim() || isRetrievalSubmitting}
              >
                {isRetrievalSubmitting ? "Submitting..." : "Run retrieval"}
              </button>
            </div>
          </form>

          {(retrievalJob.status === "pending" || retrievalJob.status === "processing") && (
            <p className="status-meta">
              Job {retrievalJob.jobId?.slice(0, 8)}... — {retrievalJob.status}. Polling...
            </p>
          )}
          {retrievalJob.status === "failed" && retrievalJob.error && (
            <div className="status-error-text">{retrievalJob.error}</div>
          )}
          {retrievalJob.status === "completed" && retrievalJob.result?.relevantChunks && (
            <div className="stack-tight" style={{ marginTop: "1rem" }}>
              <div className="title" style={{ fontSize: "1rem" }}>
                Retrieved chunks ({retrievalJob.result.relevantChunks.length})
              </div>
              <div className="status-list">
                {retrievalJob.result.relevantChunks.map((chunk, idx) => (
                  <div key={chunk.chunkId + idx} className="status-item">
                    <div className="stack-tight" style={{ flex: 1 }}>
                      <div className="status-name">
                        {chunk.chunkId.slice(0, 12)}...
                      </div>
                      <p className="status-meta" style={{ whiteSpace: "pre-wrap" }}>
                        {chunk.text.length > 300
                          ? `${chunk.text.slice(0, 300)}...`
                          : chunk.text}
                      </p>
                    </div>
                    <span className="chip chip-pill">
                      {(chunk.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

