'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Play,
  LayoutDashboard,
  Film,
  Plus,
  Settings,
  LogOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/demos', label: 'Demos', icon: Film },
  { href: '/dashboard/demos/new', label: 'New Demo', icon: Plus },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Play className="h-6 w-6 text-cyan-400" />
              <span className="text-lg font-bold text-white">DemoForge</span>
            </div>
            <nav className="hidden sm:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === `${basePath}${item.href}` ||
                  (item.href !== '/dashboard' &&
                    item.href !== '/dashboard/demos/new' &&
                    pathname.startsWith(`${basePath}${item.href}`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-400'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
