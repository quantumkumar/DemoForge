'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Settings,
  User,
  Palette,
  Bell,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Save,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface DemoSettings {
  company_name: string;
  primary_color: string;
  logo_url: string;
  email_on_completion: boolean;
}

const DEFAULT_SETTINGS: DemoSettings = {
  company_name: '',
  primary_color: '#06b6d4',
  logo_url: '',
  email_on_completion: true,
};

const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [settings, setSettings] = useState<DemoSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchUser = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        console.error('[Settings] getUser error:', error);
        return;
      }
      if (user) {
        setEmail(user.email || '');
        setOrgName(user.user_metadata?.org_name || user.user_metadata?.onebastion_org_name || '');
        const saved = user.user_metadata?.demo_settings as Partial<DemoSettings> | undefined;
        if (saved) {
          setSettings({
            company_name: saved.company_name ?? DEFAULT_SETTINGS.company_name,
            primary_color: saved.primary_color ?? DEFAULT_SETTINGS.primary_color,
            logo_url: saved.logo_url ?? DEFAULT_SETTINGS.logo_url,
            email_on_completion: saved.email_on_completion ?? DEFAULT_SETTINGS.email_on_completion,
          });
        }
      }
    } catch (err) {
      console.error('[Settings] fetch error:', err);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchUser().catch(console.error);
  }, [fetchUser]);

  const handleSave = async () => {
    // Validate color
    if (settings.primary_color && !COLOR_REGEX.test(settings.primary_color)) {
      setColorError('Enter a valid hex color (e.g. #06b6d4)');
      return;
    }
    setColorError(null);

    // Validate logo URL if provided
    if (settings.logo_url) {
      try {
        new URL(settings.logo_url);
      } catch {
        setMessage({ type: 'error', text: 'Logo URL must be a valid URL (including https://)' });
        return;
      }
    }

    setSaving(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: {
          demo_settings: {
            company_name: settings.company_name.trim(),
            primary_color: settings.primary_color,
            logo_url: settings.logo_url.trim(),
            email_on_completion: settings.email_on_completion,
          },
        },
      });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Settings saved successfully.' });
      }
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Manage your account and demo preferences</p>
      </div>

      {/* Profile Section */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
            <User className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Profile</h2>
            <p className="text-xs text-slate-500">Account information from your session</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
            <p className="text-sm text-slate-300 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
              {email || '\u2014'}
            </p>
          </div>
          {orgName && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Organization</label>
              <p className="text-sm text-slate-300 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                {orgName}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Demo Configuration Section */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
            <Palette className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Demo Configuration</h2>
            <p className="text-xs text-slate-500">Default branding applied to new demos</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="company-name" className="block text-sm font-medium text-slate-300 mb-1">
              Company Name
            </label>
            <input
              id="company-name"
              type="text"
              value={settings.company_name}
              onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))}
              placeholder="Your company name"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <p className="text-xs text-slate-600 mt-1">
              Displayed in the header of generated demos
            </p>
          </div>

          <div>
            <label htmlFor="primary-color" className="block text-sm font-medium text-slate-300 mb-1">
              Primary Color
            </label>
            <div className="flex items-center gap-3">
              <input
                id="primary-color"
                type="text"
                value={settings.primary_color}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, primary_color: e.target.value }));
                  if (colorError && COLOR_REGEX.test(e.target.value)) {
                    setColorError(null);
                  }
                }}
                placeholder="#06b6d4"
                maxLength={7}
                className={`flex-1 bg-slate-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono ${
                  colorError ? 'border-red-500' : 'border-slate-700'
                }`}
              />
              {COLOR_REGEX.test(settings.primary_color) && (
                <div
                  className="h-9 w-9 rounded-lg border border-slate-700 shrink-0"
                  style={{ backgroundColor: settings.primary_color }}
                  title={settings.primary_color}
                />
              )}
            </div>
            {colorError && (
              <p className="text-xs text-red-400 mt-1">{colorError}</p>
            )}
            <p className="text-xs text-slate-600 mt-1">
              Hex color used for buttons and accents in demos
            </p>
          </div>

          <div>
            <label htmlFor="logo-url" className="block text-sm font-medium text-slate-300 mb-1">
              Logo URL
            </label>
            <input
              id="logo-url"
              type="url"
              value={settings.logo_url}
              onChange={(e) => setSettings((s) => ({ ...s, logo_url: e.target.value }))}
              placeholder="https://your-company.com/logo.png"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <p className="text-xs text-slate-600 mt-1">
              URL to your company logo (PNG or SVG recommended)
            </p>
          </div>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
            <Bell className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Notifications</h2>
            <p className="text-xs text-slate-500">Control when you receive email alerts</p>
          </div>
        </div>
        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer group">
            <div>
              <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                Email on demo completion
              </p>
              <p className="text-xs text-slate-500">
                Receive an email when a demo crawl finishes
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.email_on_completion}
              onClick={() =>
                setSettings((s) => ({ ...s, email_on_completion: !s.email_on_completion }))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                settings.email_on_completion ? 'bg-cyan-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  settings.email_on_completion ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {/* Save Feedback */}
      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
