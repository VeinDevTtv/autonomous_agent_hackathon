import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Smart Document Filler",
  description: "Multi-agent document ingestion and analysis workflow",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500" />
                <div>
                  <h1 className="text-sm font-semibold tracking-tight text-slate-50">
                    Smart Document Filler
                  </h1>
                  <p className="text-xs text-slate-400">
                    Upload, ingest, and analyze vendor documents
                  </p>
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1">
            <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

