'use client';

import { useState, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AiPanel() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setResponse('');

    try {
      const res = await fetch(`${API_URL}/api/ai/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) setResponse((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch {
      setResponse('Error: could not reach AI service.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#753991] text-white hover:bg-[#5e2d7a] transition-colors"
      >
        <span>✦</span>
        <span>Ask AI</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-100 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <span className="text-sm font-semibold text-[#032147]">AI Assistant</span>
            <button onClick={() => setOpen(false)} className="text-[#888888] hover:text-[#032147] text-lg leading-none">×</button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
              placeholder="Ask about your board, suggest tasks, or request a plan…"
              rows={3}
              className="w-full text-sm text-[#032147] border border-gray-200 rounded-lg p-3 outline-none resize-none focus:border-[#753991] placeholder:text-gray-300"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="self-end px-4 py-1.5 text-xs font-medium text-white bg-[#753991] rounded-md hover:bg-[#5e2d7a] disabled:opacity-40 transition-colors"
            >
              {loading ? 'Thinking…' : 'Send'}
            </button>
          </form>

          {response && (
            <div className="px-4 pb-4">
              <div className="text-xs text-[#032147] bg-gray-50 rounded-lg p-3 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                {response}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
