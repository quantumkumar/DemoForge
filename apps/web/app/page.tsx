'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const router = useRouter();
  const [ssoInProgress, setSsoInProgress] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // SSO handoff code exchange (from OneBastion platform)
    const ssoCode = new URLSearchParams(window.location.search).get('sso');
    if (ssoCode) {
      setSsoInProgress(true);
      fetch(`https://app.runbastion.com/api/sso/exchange?code=${ssoCode}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.access_token || !data?.refresh_token) {
            setSsoInProgress(false);
            return;
          }
          return supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
        })
        .then(result => {
          if (result && !result.error && result.data?.session) {
            const url = new URL(window.location.href);
            url.searchParams.delete('sso');
            window.history.replaceState(null, '', url.pathname + url.search);
            router.replace('/dashboard');
          } else {
            setSsoInProgress(false);
          }
        })
        .catch(() => setSsoInProgress(false));
      return;
    }

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
