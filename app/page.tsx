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

// Phase 3 types
type AnalysisJobStatus = "pending" | "processing" | "completed" | "failed";

type VendorTotal = {
  vendorName: string;
  totalAmount: number;
  currency: string;
  invoiceCount: number;
};

type FlaggedInvoice = {
  invoiceId: string;
  number: string;
  vendorName: string;
  amount: number;
  reason: string;
};

type ClauseComparison = {
  clauseType: string;
  clauses: Array<{ contractTitle: string; text: string }>;
  analysis: string;
};

type AnalysisResult = {
  extraction: {
    vendors: Array<{ id: string; name: string }>;
    invoices: Array<{ id: string; number: string; vendorName: string; amount: number; currency: string; date: string }>;
    contracts: Array<{ id: string; title: string; parties: string[] }>;
    clauses: Array<{ id: string; type: string; text: string }>;
    amounts: Array<{ id: string; value: number; currency: string; context: string }>;
  };
  reasoning: {
    totalsByVendor: VendorTotal[];
    flaggedInvoices: FlaggedInvoice[];
    clauseComparisons: ClauseComparison[];
    actionPlan: string;
  };
};

type AnalysisJobState = {
  jobId: string | null;
  status: AnalysisJobStatus | null;
  result: AnalysisResult | null;
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

  // Phase 3 state
  const [analysisIntent, setAnalysisIntent] = useState("");
  const [analysisJob, setAnalysisJob] = useState<AnalysisJobState>({
    jobId: null,
    status: null,
    result: null,
    error: null,
  });
  const [isAnalysisSubmitting, setIsAnalysisSubmitting] = useState(false);

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

  // Phase 3: Poll analysis job
  useEffect(() => {
    const jobId = analysisJob.jobId;
    const status = analysisJob.status;
    if (!jobId || !status || status === "completed" || status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: AnalysisJobStatus;
          result: AnalysisResult | null;
          error: string | null;
        };
        setAnalysisJob((prev) => ({
          ...prev,
          status: data.status,
          result: data.result ?? null,
          error: data.error ?? null,
        }));
      } catch {
        // keep polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [analysisJob.jobId, analysisJob.status]);

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

  // Phase 3: Submit analysis
  const handleAnalysisSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = analysisIntent.trim();
    if (!trimmed || isAnalysisSubmitting) return;

    setIsAnalysisSubmitting(true);
    setAnalysisJob({ jobId: null, status: null, result: null, error: null });
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Analysis request failed");
      }
      const data = (await res.json()) as { jobId: string };
      setAnalysisJob({
        jobId: data.jobId,
        status: "pending",
        result: null,
        error: null,
      });
    } catch (err) {
      setAnalysisJob((prev) => ({
        ...prev,
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    } finally {
      setIsAnalysisSubmitting(false);
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

  const renderAnalysisResults = () => {
    const result = analysisJob.result;
    if (!result) return null;
    const { reasoning, extraction } = result;

    return (
      <div className="stack" style={{ marginTop: "1rem" }}>
        {/* Extraction Detail Cards */}
        <div className="surface subtle-shadow" style={{ padding: "1rem" }}>
          <div className="title" style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>
            📦 Extracted Entities
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <span className="chip chip-pill">{extraction.vendors.length} Vendors</span>
            <span className="chip chip-pill">{extraction.invoices.length} Invoices</span>
            <span className="chip chip-pill">{extraction.contracts.length} Contracts</span>
            <span className="chip chip-pill">{extraction.clauses.length} Clauses</span>
            <span className="chip chip-pill">{extraction.amounts.length} Amounts</span>
          </div>

          {/* Vendor details */}
          {extraction.vendors.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Vendors
              </div>
              {extraction.vendors.map((v, i) => (
                <div key={i} style={{ padding: "0.5rem", background: "rgba(255,255,255,0.03)", borderRadius: "0.375rem", marginBottom: "0.25rem" }}>
                  <div style={{ fontWeight: 500 }}>{v.name}</div>
                </div>
              ))}
            </div>
          )}

          {/* Invoice details */}
          {extraction.invoices.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Invoices
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <th style={{ textAlign: "left", padding: "0.375rem", color: "rgba(255,255,255,0.5)" }}>Invoice #</th>
                      <th style={{ textAlign: "left", padding: "0.375rem", color: "rgba(255,255,255,0.5)" }}>Vendor</th>
                      <th style={{ textAlign: "right", padding: "0.375rem", color: "rgba(255,255,255,0.5)" }}>Amount</th>
                      <th style={{ textAlign: "left", padding: "0.375rem", color: "rgba(255,255,255,0.5)" }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraction.invoices.map((inv, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "0.375rem", fontVariantNumeric: "tabular-nums" }}>{inv.number}</td>
                        <td style={{ padding: "0.375rem" }}>{inv.vendorName}</td>
                        <td style={{ padding: "0.375rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {inv.currency} {inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "0.375rem" }}>{inv.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Amounts breakdown */}
          {extraction.amounts.length > 0 && (
            <div>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Amounts Breakdown
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <th style={{ textAlign: "left", padding: "0.375rem", color: "rgba(255,255,255,0.5)" }}>Context</th>
                      <th style={{ textAlign: "right", padding: "0.375rem", color: "rgba(255,255,255,0.5)" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraction.amounts.map((a, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "0.375rem" }}>{a.context || "—"}</td>
                        <td style={{ padding: "0.375rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {a.currency} {a.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Vendor Totals Table */}
        <div className="surface subtle-shadow" style={{ padding: "1rem" }}>
          <div className="title" style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>
            💰 Vendor Totals
          </div>
          {reasoning.totalsByVendor.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "rgba(255,255,255,0.6)" }}>Vendor</th>
                    <th style={{ textAlign: "right", padding: "0.5rem", color: "rgba(255,255,255,0.6)" }}>Total</th>
                    <th style={{ textAlign: "right", padding: "0.5rem", color: "rgba(255,255,255,0.6)" }}>Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {reasoning.totalsByVendor.map((vt, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "0.5rem" }}>{vt.vendorName}</td>
                      <td style={{ padding: "0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {vt.currency} {vt.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>{vt.invoiceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="status-meta">No vendor totals calculated.</p>
          )}
        </div>

        {/* Flagged Invoices */}
        <div className="surface subtle-shadow" style={{ padding: "1rem" }}>
          <div className="title" style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>
            🚩 Flagged Invoices
          </div>
          {reasoning.flaggedInvoices.length > 0 ? (
            <div className="status-list">
              {reasoning.flaggedInvoices.map((fi, idx) => (
                <div key={idx} className="status-item">
                  <div className="stack-tight" style={{ flex: 1 }}>
                    <div className="status-name">
                      Invoice #{fi.number} — {fi.vendorName}
                    </div>
                    <div className="status-meta" style={{ lineHeight: 1.5 }}>
                      <strong>${fi.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> — {fi.reason}
                    </div>
                  </div>
                  <span className="chip chip-error">Flagged</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="status-meta" style={{ color: "#22c55e" }}>✓ No flagged invoices — all amounts are within normal limits.</p>
          )}
        </div>

        {/* Clause Comparisons */}
        <div className="surface subtle-shadow" style={{ padding: "1rem" }}>
          <div className="title" style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>
            ⚖️ Clause &amp; Terms Analysis
          </div>
          {reasoning.clauseComparisons.length > 0 ? (
            <div className="stack-tight">
              {reasoning.clauseComparisons.map((cc, idx) => (
                <div key={idx} style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: idx < reasoning.clauseComparisons.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.5rem", textTransform: "capitalize", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#818cf8", display: "inline-block" }} />
                    {cc.clauseType.replace(/_/g, " ")}
                  </div>
                  {cc.clauses.map((cl, ci) => (
                    <div key={ci} style={{ padding: "0.625rem", background: "rgba(255,255,255,0.03)", borderRadius: "0.375rem", marginBottom: "0.375rem", borderLeft: "2px solid rgba(129,140,248,0.3)" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "rgba(255,255,255,0.5)", marginBottom: "0.25rem" }}>{cl.contractTitle}</div>
                      <p style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5, color: "rgba(255,255,255,0.8)" }}>
                        {cl.text}
                      </p>
                    </div>
                  ))}
                  <p style={{ fontSize: "0.8rem", marginTop: "0.5rem", fontStyle: "italic", color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
                    {cc.analysis}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="status-meta">No clauses or terms found in the analyzed documents.</p>
          )}
        </div>

        {/* Action Plan */}
        <div className="surface subtle-shadow" style={{ padding: "1.25rem", borderLeft: "3px solid #818cf8" }}>
          <div className="title" style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>
            📋 Action Plan
          </div>
          {reasoning.actionPlan ? (
            <div style={{ lineHeight: 1.7, fontSize: "0.875rem", color: "rgba(255,255,255,0.85)" }}>
              {reasoning.actionPlan.split("\n").map((paragraph, idx) => {
                const trimmed = paragraph.trim();
                if (!trimmed) return <br key={idx} />;
                // Detect section headers (bold **text** pattern)
                if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
                  return (
                    <div key={idx} style={{ fontWeight: 700, marginTop: idx > 0 ? "0.75rem" : 0, marginBottom: "0.25rem", color: "#fff" }}>
                      {trimmed.replace(/\*\*/g, "")}
                    </div>
                  );
                }
                // Detect numbered items
                if (/^\d+\./.test(trimmed)) {
                  return (
                    <div key={idx} style={{ paddingLeft: "1rem", marginBottom: "0.25rem" }}>
                      {trimmed}
                    </div>
                  );
                }
                return <p key={idx} style={{ margin: "0 0 0.5rem", whiteSpace: "pre-wrap" }}>{trimmed}</p>;
              })}
            </div>
          ) : (
            <p className="status-meta">No action plan generated.</p>
          )}
        </div>
      </div>
    );
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

      {/* Phase 3: Extraction & Reasoning */}
      <section className="card subtle-shadow">
        <div className="stack" style={{ padding: "1.5rem 1.5rem 1.75rem" }}>
          <div className="stack-tight">
            <div className="pill-row">
              <span className="chip chip-warn">Phase 3 · Extraction &amp; Reasoning</span>
            </div>
            <div className="title">Analyze your documents</div>
            <p className="muted">
              Run the full analysis pipeline: retrieve relevant chunks, extract
              entities (vendors, invoices, contracts, clauses), write to the
              knowledge graph, and generate insights with multi-document
              reasoning.
            </p>
          </div>

          <form className="stack" onSubmit={handleAnalysisSubmit}>
            <div className="stack-tight">
              <label className="muted" htmlFor="analysis-intent-input">
                Analysis Intent
              </label>
              <textarea
                id="analysis-intent-input"
                className="input"
                rows={3}
                placeholder='e.g. "Summarize vendor totals, flag invoices over $5,000, compare contract liability clauses, and draft an email to accounting."'
                value={analysisIntent}
                onChange={(e) => setAnalysisIntent(e.target.value)}
                disabled={isAnalysisSubmitting}
              />
              <button
                type="submit"
                className="button-primary"
                disabled={!analysisIntent.trim() || isAnalysisSubmitting || analysisJob.status === "processing" || analysisJob.status === "pending"}
              >
                {isAnalysisSubmitting ? "Submitting..." : analysisJob.status === "processing" || analysisJob.status === "pending" ? "Processing..." : "Run Analysis"}
              </button>
            </div>
          </form>

          {(analysisJob.status === "pending" || analysisJob.status === "processing") && (
            <div className="stack-tight" style={{ marginTop: "0.75rem" }}>
              <p className="status-meta">
                ⏳ Analysis job {analysisJob.jobId?.slice(0, 8)}... — <strong>{analysisJob.status}</strong>
              </p>
              <p className="status-meta">
                Running pipeline: Retrieval → Extraction → Neo4j → Reasoning. This may take a moment...
              </p>
            </div>
          )}
          {analysisJob.status === "failed" && analysisJob.error && (
            <div className="status-error-text" style={{ marginTop: "0.5rem" }}>{analysisJob.error}</div>
          )}
          {analysisJob.status === "completed" && analysisJob.result && renderAnalysisResults()}
        </div>
      </section>
    </div>
  );
}
