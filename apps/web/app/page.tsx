'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const router = useRouter();
  const [ssoInProgress, setSsoInProgress] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const hash = window.location.hash;

    if (hash.includes('access_token')) {
      setSsoInProgress(true);

      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ data, error }) => {
            if (error) {
              console.error('SSO session error:', error.message);
              setSsoInProgress(false);
            } else if (data.session) {
              window.history.replaceState(null, '', window.location.pathname);
              router.replace('/dashboard');
            }
          });
      } else {
        setSsoInProgress(false);
      }
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard');
      }
    });
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
