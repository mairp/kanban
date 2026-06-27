import type { Metadata } from "next";
import "./globals.css";
import AiPanel from "@/components/AiPanel";

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
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col antialiased bg-[#f0f2f5]">
        <header className="bg-[#032147] px-6 py-4 flex items-center gap-3 flex-shrink-0 shadow-md">
          <h1 className="text-white font-bold text-xl tracking-tight">Kanban</h1>
          <div className="w-1 h-5 bg-[#ecad0a] rounded-full" />
          <span className="text-[#888888] text-sm">Project Board</span>
          <div className="ml-auto">
            <AiPanel />
          </div>
        </header>
        <main className="flex flex-col flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
