'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw authError;

      const next = searchParams.get('next') || '/dashboard';
      router.push(next);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Invalid login credentials')) {
        setError('Invalid email or password.');
      } else {
        setError(message || 'Failed to sign in.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-cyan-950/20 to-slate-950 p-4">
      <div className="max-w-md w-full space-y-8 p-8 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="text-center">
          <Play className="mx-auto h-10 w-10 text-cyan-400 mb-4" />
          <h1 className="text-2xl font-bold text-white">DemoForge</h1>
          <p className="mt-2 text-sm text-slate-400">Custom Demo Development Agent</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full px-3 py-2.5 bg-slate-800 border border-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full px-3 py-2.5 bg-slate-800 border border-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
