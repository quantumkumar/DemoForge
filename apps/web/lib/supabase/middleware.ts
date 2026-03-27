import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const pathname = request.nextUrl.pathname;

  // Public paths that don't require auth
  const publicPaths = new Set(['/', '/login', '/auth/callback']);
  const isPublic =
    publicPaths.has(pathname) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next');

  // Allow ?sso= handoff URLs through without auth (SSO will establish the session)
  const hasSsoCode = request.nextUrl.searchParams.has('sso');

  if (!user && !isPublic && !hasSsoCode) {
    const url = request.nextUrl.clone();
    url.pathname = `${basePath}/login`;
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = `${basePath}/dashboard`;
    return NextResponse.redirect(url);
  }

  // Allow the platform to iframe this product
  supabaseResponse.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://app.runbastion.com https://*.runbastion.com"
  );
  supabaseResponse.headers.set('X-Frame-Options', 'ALLOWALL');

  return supabaseResponse;
}
