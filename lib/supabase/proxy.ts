import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, isSupabaseConfigured } from './env';

const PUBLIC_PATHS = ['/login', '/auth', '/configuration'];

/** Rafraîchit la session et redirige les visiteurs non connectés vers /login. */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
  if (!isSupabaseConfigured()) {
    if (path.startsWith('/configuration') || path.startsWith('/api/')) return NextResponse.next();
    return NextResponse.redirect(new URL('/configuration', request.url));
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  if (!signedIn && !isPublic) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
    const url = new URL('/login', request.url);
    if (path !== '/') url.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (signedIn && path === '/login') return NextResponse.redirect(new URL('/', request.url));
  return response;
}
