'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Play,
  Film,
  Globe,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Activation {
  job_id: string;
  org_id: string;
  status: string;
  result_summary: {
    pages_crawled?: number;
    flows_captured?: number;
    screenshots_taken?: number;
    demos_generated?: number;
    login_successful?: boolean;
    highlights?: string[];
  } | null;
  error_message: string | null;
  created_at: string;
  stack: {
    demoforge?: {
      target_url?: string;
    };
  } | null;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  running: <Clock className="h-4 w-4 text-amber-400 animate-pulse" />,
  failed: <XCircle className="h-4 w-4 text-red-400" />,
  pending: <Clock className="h-4 w-4 text-slate-500" />,
};

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  completed: { text: 'Completed', color: 'text-emerald-400' },
  running: { text: 'Crawling...', color: 'text-amber-400' },
  failed: { text: 'Failed', color: 'text-red-400' },
  pending: { text: 'Pending', color: 'text-slate-500' },
};

export default function DashboardPage() {
  const [activations, setActivations] = useState<Activation[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);

  const fetchActivations = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const orgId = user.user_metadata?.org_id;
      if (!orgId) return;

      const { data, error } = await supabase
        .from('org_activations')
        .select('*')
        .eq('org_id', orgId)
        .eq('product_id', 'demoforge')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[Dashboard] Supabase error:', error);
        return;
      }
      setActivations(data || []);
    } catch (err) {
      console.error('[Dashboard] fetch error:', err);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchActivations().catch(console.error);
  }, [fetchActivations]);

  const totalPages = activations.reduce(
    (sum, a) => sum + (a.result_summary?.pages_crawled || 0),
    0,
  );
  const totalFlows = activations.reduce(
    (sum, a) => sum + (a.result_summary?.flows_captured || 0),
    0,
  );
  const completedCount = activations.filter((a) => a.status === 'completed').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-slate-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Demo Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage your interactive product demos
          </p>
        </div>
        <Link
          href="/dashboard/demos/new"
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors text-sm"
        >
          <Plus className="h-4 w-4" />
          New Demo
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Film className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-slate-500">Demos Created</span>
          </div>
          <p className="text-2xl font-bold text-white">{completedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-slate-500">Pages Crawled</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalPages}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Play className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-slate-500">Interactive Flows</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalFlows}</p>
        </div>
      </div>

      {/* Recent Demos */}
      {activations.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-white">Recent Demos</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {activations.map((activation) => {
              const status = STATUS_LABELS[activation.status] || STATUS_LABELS.pending;
              const targetUrl = activation.stack?.demoforge?.target_url || 'Unknown URL';
              return (
                <div
                  key={activation.job_id}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-slate-800/30 transition-colors"
                >
                  {STATUS_ICONS[activation.status] || STATUS_ICONS.pending}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {targetUrl}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className={status.color}>{status.text}</span>
                      {activation.result_summary && (
                        <span>
                          {activation.result_summary.pages_crawled} pages,{' '}
                          {activation.result_summary.flows_captured} flows
                        </span>
                      )}
                      <span>
                        {new Date(activation.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {activation.error_message && (
                      <p className="text-xs text-red-400 mt-1 truncate">
                        {activation.error_message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-12 text-center">
          <Play className="mx-auto h-12 w-12 text-slate-700 mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No demos yet</h2>
          <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
            Point DemoForge at any web application and it will autonomously crawl,
            capture, and build interactive product demos.
          </p>
          <Link
            href="/dashboard/demos/new"
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 transition-colors"
          >
            Create Your First Demo
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
