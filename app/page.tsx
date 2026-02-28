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
        return <span className="chip chip-pill">Uploading...</span>;
      case "uploaded":
        return <span className="chip chip-pill">Queued</span>;
      case "ingesting":
        return <span className="chip chip-warn animate-pulse">Ingesting</span>;
      case "ready":
        return <span className="chip chip-success">Graph Ready</span>;
      case "error":
        return <span className="chip chip-error">Failed</span>;
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
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <div className="surface flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-md border-white/10 group hover:bg-slate-800/60 transition-colors">
            <span className="text-xl">🏢</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vendors</span>
              <span className="text-xl font-extrabold text-white leading-none">{extraction.vendors.length}</span>
            </div>
          </div>
          <div className="surface flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-md border-white/10 group hover:bg-slate-800/60 transition-colors">
            <span className="text-xl">🧾</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Invoices</span>
              <span className="text-xl font-extrabold text-white leading-none">{extraction.invoices.length}</span>
            </div>
          </div>
          <div className="surface flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-md border-white/10 group hover:bg-slate-800/60 transition-colors">
            <span className="text-xl">📄</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contracts</span>
              <span className="text-xl font-extrabold text-white leading-none">{extraction.contracts.length}</span>
            </div>
          </div>
          <div className="surface flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-md border-white/10 group hover:bg-slate-800/60 transition-colors">
            <span className="text-xl">⚖️</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clauses</span>
              <span className="text-xl font-extrabold text-white leading-none">{extraction.clauses.length}</span>
            </div>
          </div>
          <div className="surface flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-md border-white/10 group hover:bg-slate-800/60 transition-colors">
            <span className="text-xl">💰</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Amounts</span>
              <span className="text-xl font-extrabold text-white leading-none">{extraction.amounts.length}</span>
            </div>
          </div>
        </div>

        {/* Financials & Tables Grid */}
        <div className="grid gap-6 md:grid-cols-2 mt-2">

          {/* Vendor Totals Table */}
          <div className="surface flex flex-col overflow-hidden">
            <div className="p-5 border-b border-white/5 bg-slate-800/40">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-sky-400 text-xl font-sans leading-none">�</span> Financial Exposure
              </h3>
            </div>
            {reasoning.totalsByVendor.length > 0 ? (
              <div className="overflow-x-auto p-0">
                <table className="w-full text-sm text-left font-sans">
                  <thead className="bg-slate-900/50 text-xs text-slate-400 uppercase tracking-wider shadow-sm">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Vendor</th>
                      <th className="px-5 py-3 font-semibold text-right">Total</th>
                      <th className="px-5 py-3 font-semibold text-right">Invoices</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {reasoning.totalsByVendor.map((vt, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="px-5 py-4 font-medium text-slate-200">{vt.vendorName}</td>
                        <td className="px-5 py-4 font-bold text-right text-emerald-400 font-mono tracking-tight">
                          {vt.currency} {vt.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-4 text-right text-slate-400 font-mono">{vt.invoiceCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-sm italic bg-slate-800/20">No vendor totals calculated.</div>
            )}
          </div>

          {/* Flagged Invoices */}
          <div className="surface flex flex-col overflow-hidden">
            <div className="p-5 border-b border-white/5 bg-slate-800/40 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-amber-400 text-xl font-sans leading-none">⚠️</span> Risk Anomalies
              </h3>
              {reasoning.flaggedInvoices.length > 0 && (
                <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded-md border border-red-500/30">
                  {reasoning.flaggedInvoices.length} Flags
                </span>
              )}
            </div>

            <div className="p-5 flex-1 relative bg-slate-900/20">
              {reasoning.flaggedInvoices.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {reasoning.flaggedInvoices.map((fi, idx) => (
                    <div key={idx} className="bg-red-950/40 border border-red-900/60 rounded-xl p-4 transition-all hover:bg-red-900/50 hover:shadow-lg hover:shadow-red-900/20">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-red-200 text-sm whitespace-nowrap overflow-hidden text-ellipsis mr-2">{fi.vendorName} <span className="text-red-400 font-normal">#{fi.number}</span></span>
                        <span className="font-black text-rose-400 font-mono text-sm shrink-0">${fi.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <p className="text-sm text-red-300/80 leading-relaxed font-medium">{fi.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-8 text-center bg-emerald-950/20 border border-emerald-900/30 rounded-xl">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="font-semibold text-emerald-400 text-sm">All invoices within normal bounds.</p>
                  <p className="text-xs text-emerald-500/70 mt-1">No anomalies detected in the current set.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Clause Comparisons */}
        <div className="surface p-6 mt-2 shadow-lg">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="bg-indigo-500/20 p-2 rounded-xl border border-indigo-500/30 text-indigo-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
            </span>
            Contract Clause Analysis
          </h3>
          {reasoning.clauseComparisons.length > 0 ? (
            <div className="grid gap-6 lg:grid-cols-2">
              {reasoning.clauseComparisons.map((cc, idx) => (
                <div key={idx} className="flex flex-col bg-slate-800/40 rounded-2xl border border-white/5 overflow-hidden transition-all hover:bg-slate-800/60">
                  <div className="bg-slate-900/60 px-5 py-3 border-b border-white/5">
                    <h4 className="font-bold text-lg text-indigo-300 capitalize">{cc.clauseType.replace(/_/g, " ")}</h4>
                  </div>
                  <div className="p-5 flex-1 flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                      {cc.clauses.map((cl, ci) => (
                        <div key={ci} className="bg-slate-900/40 p-4 rounded-xl border-l-4 border-indigo-500">
                          <div className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">{cl.contractTitle}</div>
                          <p className="text-sm text-slate-300 leading-relaxed font-serif italic max-h-32 overflow-y-auto custom-scrollbar pr-2">"{cl.text}"</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-auto pt-4 bg-sky-900/10 border border-sky-500/20 rounded-xl p-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-sky-500"></div>
                      <p className="text-sm font-medium text-sky-200/90 leading-relaxed">
                        {cc.analysis}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-6 italic bg-slate-800/20 rounded-xl">No contract clauses found for analysis.</p>
          )}
        </div>

        {/* Final Plan & Outputs */}
        <div className="grid gap-6 md:grid-cols-2 mt-2">

          {/* Action Plan */}
          <div className="surface p-6 flex flex-col h-full border-l-4 border-l-sky-500 shadow-xl">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="text-sky-400">📋</span> Action Plan
            </h3>
            {reasoning.actionPlan ? (
              <div className="prose prose-invert prose-slate prose-sm max-w-none text-slate-300">
                {reasoning.actionPlan.split("\n").map((paragraph, idx) => {
                  const trimmed = paragraph.trim();
                  if (!trimmed) return <br key={idx} />;
                  // Detect section headers (bold **text** pattern)
                  if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
                    return (
                      <h4 key={idx} className="text-sky-300 font-bold mt-4 mb-2">
                        {trimmed.replace(/\*\*/g, "")}
                      </h4>
                    );
                  }
                  // Detect numbered items
                  if (/^\d+\./.test(trimmed)) {
                    return (
                      <div key={idx} className="pl-4 mb-2 relative">
                        <span className="absolute left-0 text-sky-500 font-mono text-xs top-0.5">{trimmed.split('.')[0]}.</span>
                        {trimmed.substring(trimmed.indexOf('.') + 1).trim()}
                      </div>
                    );
                  }
                  // Dash items
                  if (trimmed.startsWith("- ")) {
                    return (
                      <div key={idx} className="pl-4 mb-2 relative">
                        <span className="absolute left-0 text-sky-500">•</span>
                        {trimmed.substring(2)}
                      </div>
                    );
                  }
                  return <p key={idx} className="mb-3 leading-relaxed">{trimmed}</p>;
                })}
              </div>
            ) : (
              <p className="text-slate-400 text-sm italic bg-slate-800/20 p-4 rounded-xl text-center flex-1 flex items-center justify-center">No action plan generated.</p>
            )}
          </div>

          {/* Email Draft Area */}
          <div className="stack-tight h-full">
            {result.execution?.emailDraft && (
              <div className="surface p-0 flex flex-col h-full overflow-hidden shadow-xl border border-white/5">
                <div className="bg-slate-800/40 p-4 border-b border-white/5 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    Communication Draft
                  </h3>
                  <button
                    type="button"
                    className="text-xs font-bold bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 py-1.5 px-3 rounded-lg transition-colors border border-indigo-500/30 flex items-center gap-1.5"
                    onClick={() => void navigator.clipboard.writeText(result.execution!.emailDraft)}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                    Copy HTML
                  </button>
                </div>
                <div className="p-5 flex-1 bg-slate-900/60 font-mono text-sm text-slate-300 whitespace-pre-wrap overflow-y-auto w-full custom-scrollbar leading-relaxed">
                  {result.execution.emailDraft}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enrichment Data */}
        {(result.vendor_risk_enrichment?.length ?? 0) > 0 && (
          <div className="surface p-6 overflow-hidden relative border-t-4 border-t-amber-500/40 shadow-xl mt-2">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
              <svg className="w-48 h-48 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>
            </div>
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3 mb-1">
                External Risk Intelligence
              </h3>
              <p className="text-sm font-semibold text-amber-500/80 uppercase tracking-widest mb-6 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                Tavily Deep Search
              </p>

              <div className="grid gap-5 lg:grid-cols-2">
                {result.vendor_risk_enrichment!.map((v, idx) => (
                  <div key={idx} className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-5 border border-white/10 shadow-lg hover:border-amber-500/30 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="text-lg font-bold text-white">{v.vendor_name}</h4>
                      <span className={`px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg border ${v.risk_level.toLowerCase() === 'high' ? 'bg-red-500/20 text-red-400 border-red-500/30' : v.risk_level.toLowerCase() === 'medium' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}`}>
                        {v.risk_level} Risk
                      </span>
                    </div>
                    {v.background_summary && (
                      <p className="text-sm text-slate-300 leading-relaxed mb-4">{v.background_summary}</p>
                    )}
                    {v.risk_reasons?.length > 0 && (
                      <div className="space-y-2 bg-slate-800/50 p-3 rounded-xl border border-white/5">
                        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Key Factors</h5>
                        <ul className="space-y-1.5">
                          {v.risk_reasons.slice(0, 5).map((r, i) => (
                            <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                              <span className="text-amber-500/70 mt-0.5 shrink-0">•</span>
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CSV Download Card */}
        {result.execution?.csvUrl && (
          <div className="surface p-6 flex items-center justify-between bg-gradient-to-r from-emerald-900/20 to-sky-900/20 mt-4 border border-emerald-500/20 shadow-xl rounded-2xl">
            <div className="flex items-center gap-5">
              <div className="bg-emerald-500/20 text-emerald-400 p-3.5 rounded-2xl shadow-inner border border-emerald-500/30">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div>
                <div className="font-bold text-white text-lg tracking-tight">Structured Data Export</div>
                <div className="text-sm text-emerald-300/80 font-medium">Download the extracted graph entities as a CSV</div>
              </div>
            </div>
            <a
              href={result.execution.csvUrl}
              className="button-primary !bg-emerald-500 hover:!bg-emerald-400 !text-slate-900 !border-emerald-400 shadow-emerald-500/30 font-bold px-6"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="flex items-center gap-2">
                Download CSV
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </span>
            </a>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="stack w-full max-w-5xl mx-auto space-y-12">
      {/* Introduction / Header Area */}
      <div className="text-center py-8 space-y-4">
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-2 pb-2">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-sky-300 to-indigo-400 drop-shadow-sm">Intelligent Document Analysis</span>
        </h2>
        <p className="text-lg text-slate-300 max-w-2xl mx-auto font-light leading-relaxed">
          Upload your contracts and invoices. Our autonomous agents will ingest, parse, and reason over your data instantly.
        </p>
      </div>

      <section className="card group">
        <div className="stack" style={{ padding: "2.5rem" }}>
          <div className="stack-tight border-b border-white/10 pb-5">
            <div className="title flex items-center gap-3">
              <div className="bg-indigo-500/20 p-2.5 rounded-xl border border-indigo-500/30 shadow-inner group-hover:bg-indigo-500/30 transition-colors">
                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              Knowledge Ingestion
            </div>
            <p className="muted text-base mt-2">
              Drop your files below to build the knowledge graph automatically.
            </p>
          </div>

          <form className="stack mt-4" onSubmit={handleSubmit}>
            <div className="stack-tight file-input relative">
              <label className="file-dropzone shadow-2xl" htmlFor="file-input">
                <input
                  id="file-input"
                  key={fileInputKey}
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={handleFilesChange}
                />
                <div className="stack-tight flex flex-col items-center relative z-10 transition-transform duration-300 transform">
                  <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl flex items-center justify-center shadow-xl mb-4 border border-white/10 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-8 h-8 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <div className="status-name text-xl font-semibold text-white tracking-wide">
                    Drag and drop your files here
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
            <div className="mt-10">
              <div className="text-xs font-bold text-slate-400 mb-4 tracking-widest uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                Active Queue
              </div>
              <div className="status-list space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="status-item group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center border border-white/5 group-hover:bg-slate-700/50 transition-colors">
                        <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <div className="stack-tight gap-1">
                        <div className="status-name text-base group-hover:text-indigo-300 transition-colors">{doc.filename}</div>
                        <div className="status-meta text-xs">
                          {doc.createdAt
                            ? `Ingested at ${new Date(doc.createdAt).toLocaleTimeString()}`
                            : "Queued"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {doc.errorMessage && (
                        <div className="status-error-text text-xs">
                          {doc.errorMessage}
                        </div>
                      )}
                      {doc.status === "error" && (
                        <button
                          className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold py-1.5 px-4 rounded-lg transition-colors shadow-sm"
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
        <div className="stack" style={{ padding: "2.5rem" }}>
          <div className="stack-tight mb-4 border-b border-white/10 pb-4">
            <div className="title flex items-center gap-3 text-3xl">
              <div className="bg-sky-500/20 p-2 rounded-lg border border-sky-500/30">
                <svg className="w-7 h-7 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              Analysis Orchestrator
            </div>
            <p className="muted text-base mt-2">
              Command the reasoning engine. Combine entities, compute math, compare liabilities, and draft communications autonomously.
            </p>
          </div>

          <form className="stack" onSubmit={handleAnalysisSubmit}>
            <div className="stack-tight relative mt-2 group">
              <label className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-1 drop-shadow-md" htmlFor="analysis-intent-input">
                Prompt Intent
              </label>
              <textarea
                id="analysis-intent-input"
                className="input min-h-[160px] resize-none pb-16 text-lg leading-relaxed shadow-inner"
                placeholder='Evaluate vendor risks, calculate total exposure for ACME Corp, compare limitation of liability causes across all master agreements, and draft an executive brief.'
                value={analysisIntent}
                onChange={(e) => setAnalysisIntent(e.target.value)}
                disabled={isAnalysisSubmitting}
              />
              <div className="absolute bottom-4 right-4">
                <button
                  type="submit"
                  className="button-primary shadow-xl opacity-90 hover:opacity-100"
                  disabled={!analysisIntent.trim() || isAnalysisSubmitting || analysisJob.status === "processing" || analysisJob.status === "pending"}
                >
                  {isAnalysisSubmitting ? "Orchestrating..." : analysisJob.status === "processing" || analysisJob.status === "pending" ? (
                    <div className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Pipeline Active
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 font-bold text-base">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                      Execute Workflow
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
