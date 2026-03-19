'use client';

import { useEffect, useState } from 'react';
import { Settings, User, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const [email, setEmail] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || '');
        setOrgName(user.user_metadata?.org_name || '');
      }
      setLoading(false);
    };
    fetchUser().catch(console.error);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Account information</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
            <User className="h-4.5 w-4.5 text-cyan-400" />
          </div>
          <h2 className="font-semibold text-white">Account</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
            <p className="text-sm text-slate-300">{email || '—'}</p>
          </div>
          {orgName && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Organization
              </label>
              <p className="text-sm text-slate-300">{orgName}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
