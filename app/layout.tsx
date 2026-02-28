import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Smart Document Filler",
  description: "Multi-agent document ingestion and analysis workflow",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200/50 bg-white/70 backdrop-blur-md sticky top-0 z-50">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-slate-900 shadow-sm flex items-center justify-center">
                  <div className="w-3 h-3 bg-white rounded-sm" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold tracking-tight text-slate-900">
                    Smart Document Filler
                  </h1>
                  <p className="text-xs text-slate-500">
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

