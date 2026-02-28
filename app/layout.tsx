import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Aura | Smart Document Intelligence",
  description: "Next-generation multi-agent document analysis",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased text-slate-200">
        <div className="flex min-h-screen flex-col relative overflow-hidden">

          {/* Ambient Lighting Orbs */}
          <div className="absolute top-[-10rem] left-[-10rem] w-[40rem] h-[40rem] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-10rem] right-[-10rem] w-[40rem] h-[40rem] bg-sky-500/20 rounded-full blur-[120px] pointer-events-none" />

          <header className="border-b border-white/10 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-50 transition-all duration-300">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-center gap-3 group cursor-pointer">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg flex items-center justify-center p-[1px] transform group-hover:scale-105 transition-all duration-300">
                  <div className="h-full w-full bg-slate-900/80 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <div className="w-4 h-4 rounded-sm bg-gradient-to-br from-indigo-400 to-sky-300 animate-pulse" />
                  </div>
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                    Aura
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">INTELLIGENCE</span>
                  </h1>
                  <p className="text-xs text-slate-400 font-medium">
                    Autonomous Document Analysis
                  </p>
                </div>
              </div>
              <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-300">
                <span className="hover:text-white transition-colors cursor-pointer block">Dashboard</span>
                <span className="hover:text-white transition-colors cursor-pointer block">History</span>
                <span className="hover:text-white transition-colors cursor-pointer block">Settings</span>
                <div className="h-8 w-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-bold ml-2">
                  U
                </div>
              </nav>
            </div>
          </header>
          <main className="flex-1 relative z-10 w-full flex align-center justify-center">
            <div className="mx-auto max-w-6xl px-4 py-12 w-full">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
