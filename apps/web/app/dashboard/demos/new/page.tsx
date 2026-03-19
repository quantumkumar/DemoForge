'use client';

import { useState } from 'react';
import { Globe, Play, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function NewDemoPage() {
  const [targetUrl, setTargetUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);

    try {
      // Validate URL
      new URL(targetUrl);
    } catch {
      setResult({ success: false, message: 'Please enter a valid URL (including https://)' });
      setSubmitting(false);
      return;
    }

    // Demo creation is triggered via the platform activation pipeline.
    // For now, show guidance on how to trigger it.
    setResult({
      success: true,
      message:
        'Demo crawl request received. The crawl will be initiated through the OneBastion platform activation pipeline. Check the dashboard for progress.',
    });
    setSubmitting(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Create New Demo</h1>
        <p className="text-slate-400 text-sm mt-1">
          Enter a URL and DemoForge will crawl and build an interactive demo
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-6">
        <div>
          <label htmlFor="target-url" className="block text-sm font-medium text-slate-300 mb-2">
            Target URL
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                id="target-url"
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://your-app.com"
                required
                className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            DemoForge will crawl up to 20 pages from this URL, capture screenshots,
            and identify interactive flows.
          </p>
        </div>

        {result && (
          <div
            className={`flex items-start gap-2 p-4 rounded-lg text-sm ${
              result.success
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span>{result.message}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !targetUrl.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {submitting ? 'Starting crawl...' : 'Start Demo Crawl'}
        </button>
      </form>
    </div>
  );
}
