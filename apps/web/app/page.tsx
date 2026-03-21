'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const router = useRouter();
  const [ssoInProgress, setSsoInProgress] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Detect SSO magic link landing (hash fragment contains access_token)
    if (window.location.hash.includes('access_token')) {
      setSsoInProgress(true);
    }

    // Listen for auth state changes — fires when Supabase processes
    // the hash fragment tokens from a magic link.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          router.replace('/dashboard');
        }
      },
    );

    // Also check for existing session (user navigated here while logged in)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard');
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [router]);

  if (ssoInProgress) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Signing you in...</p>
        </div>
      </div>
    );
  }

  // Default: redirect to dashboard (original behavior)
  router.replace('/dashboard');
  return null;
}
