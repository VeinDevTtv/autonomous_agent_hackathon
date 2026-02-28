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

type VendorRiskEnrichment = {
  vendor_id: string;
  vendor_name: string;
  risk_level: string;
  background_summary: string;
  risk_reasons: string[];
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
  execution?: {
    csvUrl: string;
    markdownReport: string;
    emailDraft: string;
    jsonResult: object;
  };
  vendor_risk_enrichment?: VendorRiskEnrichment[];
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
        {/* Extracted Entities badges */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <span className="chip chip-pill" style={{ background: "white", border: "1px solid #e2e8f0" }}><strong>{extraction.vendors.length}</strong> Vendors</span>
          <span className="chip chip-pill" style={{ background: "white", border: "1px solid #e2e8f0" }}><strong>{extraction.invoices.length}</strong> Invoices</span>
          <span className="chip chip-pill" style={{ background: "white", border: "1px solid #e2e8f0" }}><strong>{extraction.contracts.length}</strong> Contracts</span>
          <span className="chip chip-pill" style={{ background: "white", border: "1px solid #e2e8f0" }}><strong>{extraction.clauses.length}</strong> Clauses</span>
          <span className="chip chip-pill" style={{ background: "white", border: "1px solid #e2e8f0" }}><strong>{extraction.amounts.length}</strong> Amounts</span>
        </div>

        {/* Financials & Tables Grid */}
        <div className="grid gap-6 md:grid-cols-2">

          {/* Vendor Totals Table */}
          <div className="surface subtle-shadow flex flex-col" style={{ padding: "1.25rem", background: "white" }}>
            <div className="title" style={{ fontSize: "1rem", marginBottom: "1rem" }}>💰 Vendor Totals</div>
            {reasoning.totalsByVendor.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "#64748b", fontWeight: 500 }}>Vendor</th>
                      <th style={{ textAlign: "right", padding: "0.5rem", color: "#64748b", fontWeight: 500 }}>Total</th>
                      <th style={{ textAlign: "right", padding: "0.5rem", color: "#64748b", fontWeight: 500 }}>Invoices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reasoning.totalsByVendor.map((vt, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f8fafc" }}>
                        <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>{vt.vendorName}</td>
                        <td style={{ padding: "0.75rem 0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {vt.currency} {vt.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem", textAlign: "right", color: "#64748b" }}>{vt.invoiceCount}</td>
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
          <div className="surface subtle-shadow flex flex-col" style={{ padding: "1.25rem", background: "white" }}>
            <div className="title" style={{ fontSize: "1rem", marginBottom: "1rem" }}>🚩 Flagged Anomalies</div>
            {reasoning.flaggedInvoices.length > 0 ? (
              <div className="flex flex-col gap-3">
                {reasoning.flaggedInvoices.map((fi, idx) => (
                  <div key={idx} className="p-3 bg-red-50 border border-red-100 rounded-lg">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-red-900 text-sm">{fi.vendorName} (Inv #{fi.number})</span>
                      <span className="font-bold text-red-700 text-sm">${fi.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-xs text-red-800 leading-snug">{fi.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center p-6 bg-green-50 rounded-lg border border-green-100 h-full">
                <p className="text-sm font-medium text-green-700">✓ No flagged invoices — all amounts are within bounds.</p>
              </div>
            )}
          </div>
        </div>

        {/* Clause Comparisons */}
        <div className="surface subtle-shadow" style={{ padding: "1.5rem", background: "white" }}>
          <div className="title" style={{ fontSize: "1rem", marginBottom: "1rem" }}>
            ⚖️ Contract Clause Analysis
          </div>
          {reasoning.clauseComparisons.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {reasoning.clauseComparisons.map((cc, idx) => (
                <div key={idx} className="flex flex-col">
                  <div style={{ fontWeight: 600, marginBottom: "0.75rem", textTransform: "capitalize", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#0f172a", display: "inline-block" }} />
                    {cc.clauseType.replace(/_/g, " ")}
                  </div>
                  <div className="flex flex-col gap-2 mb-3">
                    {cc.clauses.map((cl, ci) => (
                      <div key={ci} style={{ padding: "0.75rem", background: "#f8fafc", borderRadius: "0.5rem", borderLeft: "3px solid #cbd5e1" }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "0.25rem", textTransform: "uppercase" }}>{cl.contractTitle}</div>
                        <p style={{ fontSize: "0.825rem", margin: 0, lineHeight: 1.5, color: "#334155" }}>
                          {cl.text}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100/50 flex-1">
                    <p style={{ fontSize: "0.85rem", fontStyle: "italic", color: "#334155", lineHeight: 1.5, margin: 0 }}>
                      {cc.analysis}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="status-meta">No clauses or terms found in the analyzed documents.</p>
          )}
        </div>

        {/* Action Plan */}
        <div className="surface subtle-shadow" style={{ padding: "1.5rem", background: "white", borderLeft: "4px solid #0f172a" }}>
          <div className="title" style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
            📋 Recommended Action Plan
          </div>
          {reasoning.actionPlan ? (
            <div style={{ lineHeight: 1.7, fontSize: "0.95rem", color: "#334155" }}>
              {reasoning.actionPlan.split("\n").map((paragraph, idx) => {
                const trimmed = paragraph.trim();
                if (!trimmed) return <br key={idx} />;
                // Detect section headers (bold **text** pattern)
                if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
                  return (
                    <div key={idx} style={{ fontWeight: 700, marginTop: idx > 0 ? "1rem" : 0, marginBottom: "0.5rem", color: "#0f172a" }}>
                      {trimmed.replace(/\*\*/g, "")}
                    </div>
                  );
                }
                // Detect numbered items
                if (/^\d+\./.test(trimmed)) {
                  return (
                    <div key={idx} style={{ paddingLeft: "1rem", marginBottom: "0.35rem" }}>
                      {trimmed}
                    </div>
                  );
                }
                return <p key={idx} style={{ margin: "0 0 0.75rem", whiteSpace: "pre-wrap" }}>{trimmed}</p>;
              })}
            </div>
          ) : (
            <p className="status-meta">No action plan generated.</p>
          )}
        </div>

        {/* Execution outputs */}
        {result.execution ? (
          <div className="grid gap-6 md:grid-cols-2">

            <div className="stack-tight">
              {result.execution.emailDraft && (
                <div className="surface subtle-shadow flex flex-col h-full" style={{ padding: "1.5rem", background: "white" }}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="title" style={{ fontSize: "1rem" }}>✉️ Email Draft</div>
                    <button
                      type="button"
                      className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-md transition-colors"
                      onClick={() => {
                        void navigator.clipboard.writeText(result.execution!.emailDraft);
                      }}
                    >
                      Copy
                    </button>
                  </div>
                  <pre style={{ flex: 1, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.875rem", margin: 0, padding: "1rem", background: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0", color: "#334155" }}>
                    {result.execution.emailDraft}
                  </pre>
                </div>
              )}
            </div>

            <div className="stack-tight">
              {(result.vendor_risk_enrichment?.length ?? 0) > 0 && (
                <div className="surface subtle-shadow" style={{ padding: "1.5rem", background: "white" }}>
                  <div className="title" style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>
                    🔍 External Vendor Risk Insights
                  </div>
                  <p className="text-xs text-slate-500 mb-4 font-medium uppercase tracking-wider">
                    Sourced via Tavily Web Search
                  </p>
                  <div className="flex flex-col gap-4">
                    {result.vendor_risk_enrichment!.map((v, idx) => (
                      <div key={idx} style={{ padding: "1rem", background: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
                        <div className="flex justify-between items-center mb-2">
                          <div style={{ fontWeight: 600 }}>{v.vendor_name}</div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.risk_level.toLowerCase() === 'high' ? 'bg-red-100 text-red-700' : v.risk_level.toLowerCase() === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                            Risk: {v.risk_level}
                          </span>
                        </div>
                        {v.background_summary && (
                          <p style={{ margin: "0.5rem 0", fontSize: "0.85rem", lineHeight: 1.5, color: "#475569" }}>{v.background_summary}</p>
                        )}
                        {v.risk_reasons?.length > 0 && (
                          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "0.8rem", color: "#64748b" }}>
                            {v.risk_reasons.slice(0, 5).map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CSV Download Card */}
            {result.execution.csvUrl && (
              <div className="surface subtle-shadow flex items-center justify-between col-span-full" style={{ padding: "1.25rem 1.5rem", background: "white" }}>
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Download Data Export</div>
                    <div className="text-xs text-slate-500">CSV format of your parsed invoices and vendors</div>
                  </div>
                </div>
                <a
                  href={result.execution.csvUrl}
                  className="button-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Export CSV
                </a>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };


  return (
    <div className="stack max-w-4xl mx-auto w-full">
      <section className="card">
        <div className="stack" style={{ padding: "2rem" }}>
          <div className="stack-tight">
            <div className="title text-2xl">Document Library</div>
            <p className="muted text-base">
              Upload your invoices and contracts. They will be securely processed and ingested into the knowledge graph instantly.
            </p>
          </div>

          <form className="stack" onSubmit={handleSubmit}>
            <div className="stack-tight file-input">
              <label className="file-dropzone shadow-sm" htmlFor="file-input">
                <input
                  id="file-input"
                  key={fileInputKey}
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={handleFilesChange}
                />
                <div className="stack-tight flex flex-col items-center">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-2 border border-slate-100">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  </div>
                  <div className="status-name text-lg font-medium">
                    Drop files here or click to browse
                  </div>
                  <p className="status-meta text-center max-w-sm">
                    Support for PDFs and images (PNG, JPEG).
                  </p>
                </div>
              </label>

              {files && files.length > 0 && (
                <div className="bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="text-sm font-medium text-slate-700">{files.length} file{files.length > 1 ? "s" : ""} selected</span>
                  </div>
                </div>
              )}
              {uploadError && (
                <div className="status-error-text mt-2" role="alert">
                  {uploadError}
                </div>
              )}
              {uploadSuccess && (
                <div className="text-emerald-600 bg-emerald-50 px-3 py-2 rounded-md border border-emerald-100 font-medium text-sm mt-2" role="status">
                  {uploadSuccess}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="button-primary self-start"
              disabled={!files || !files.length || isSubmitting}
            >
              {isSubmitting ? "Uploading..." : "Upload Documents"}
            </button>
          </form>

          {/* Upload Status List */}
          {documents.length > 0 && (
            <div className="mt-8">
              <div className="text-sm font-semibold text-slate-900 mb-3 tracking-wide uppercase">Ingestion Queue</div>
              <div className="status-list">
                {documents.map((doc) => (
                  <div key={doc.id} className="status-item">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center border border-slate-200">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      </div>
                      <div className="stack-tight gap-0.5">
                        <div className="status-name text-sm">{doc.filename}</div>
                        <div className="status-meta text-xs">
                          {doc.createdAt
                            ? `Created at ${new Date(doc.createdAt).toLocaleTimeString()}`
                            : "Queued"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {doc.errorMessage && (
                        <div className="status-error-text text-xs mr-2">
                          {doc.errorMessage}
                        </div>
                      )}
                      {doc.status === "error" && (
                        <button
                          className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold py-1 px-3 rounded-md transition-colors box-shadow-sm"
                          onClick={() => handleRetry(doc.id)}
                        >
                          Retry
                        </button>
                      )}
                      {renderStatusChip(doc.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Analysis Section */}
      <section className="card pb-8">
        <div className="stack" style={{ padding: "2rem" }}>
          <div className="stack-tight">
            <div className="title text-2xl">Analysis Studio</div>
            <p className="muted text-base">
              Query your documents. Our agent will extract entities, reason over the knowledge graph, and generate insights based on your prompt.
            </p>
          </div>

          <form className="stack" onSubmit={handleAnalysisSubmit}>
            <div className="stack-tight relative">
              <label className="text-sm font-semibold text-slate-900 tracking-wide uppercase" htmlFor="analysis-intent-input">
                Prompt Intent
              </label>
              <textarea
                id="analysis-intent-input"
                className="input min-h-[120px] resize-none pb-14 shadow-sm"
                placeholder='e.g. "Summarize vendor totals, flag invoices over $5,000, compare contract liability clauses, and draft an email to accounting."'
                value={analysisIntent}
                onChange={(e) => setAnalysisIntent(e.target.value)}
                disabled={isAnalysisSubmitting}
              />
              <div className="absolute bottom-2 right-2">
                <button
                  type="submit"
                  className="button-primary shadow-md"
                  disabled={!analysisIntent.trim() || isAnalysisSubmitting || analysisJob.status === "processing" || analysisJob.status === "pending"}
                >
                  {isAnalysisSubmitting ? "Submitting..." : analysisJob.status === "processing" || analysisJob.status === "pending" ? (
                    <div className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Processing Pipeline
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Run Analysis
                    </div>
                  )}
                </button>
              </div>
            </div>
          </form>

          {(analysisJob.status === "pending" || analysisJob.status === "processing") && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mt-4 flex items-start gap-4">
              <div className="bg-sky-100 text-sky-600 rounded-lg p-2 mt-0.5">
                <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <div className="font-semibold text-slate-900 mb-1">Agent Pipeline Running (Job {analysisJob.jobId?.slice(0, 6)})</div>
                <div className="flex flex-wrap text-sm font-medium text-slate-500 gap-2 items-center">
                  <span className="text-slate-900">Retrieval</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  <span className="text-slate-900">Extraction</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  <span className="text-slate-900">Neo4j</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  <span className="text-slate-900">Reasoning</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  <span className="text-slate-900">Tavily</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  <span className="text-slate-900">Execution</span>
                </div>
              </div>
            </div>
          )}

          {analysisJob.status === "failed" && analysisJob.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3 mt-4">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-sm font-medium">{analysisJob.error}</span>
            </div>
          )}

          {analysisJob.status === "completed" && analysisJob.result && (
            <div className="pt-4 border-t border-slate-200 mt-2">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                <span className="font-bold text-slate-900">Analysis Complete</span>
              </div>
              {renderAnalysisResults()}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
