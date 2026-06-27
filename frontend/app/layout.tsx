import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AiPanel from "@/components/AiPanel";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Kanban Board",
  description: "Project management kanban board",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`}>
      <body className="h-full flex flex-col antialiased">
        <header className="glass-strong m-3 mb-0 rounded-2xl px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br from-cyan-300 to-fuchsia-400 shadow-[0_0_12px_rgba(34,211,238,0.7)]" />
            <h1 className="text-white font-semibold text-xl tracking-tight">Kanban</h1>
          </div>
          <span className="text-[var(--text-muted)] text-sm font-light">Project Board</span>
          <div className="ml-auto">
            <AiPanel />
          </div>
        </header>
        <main className="flex flex-col flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
