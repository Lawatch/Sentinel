import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Retour du lien magique : jeton (token_hash) ou code PKCE. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const supabase = await createClient();
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  let error: string | null = null;
  if (token_hash && type) {
    const r = await supabase.auth.verifyOtp({ token_hash, type });
    error = r.error?.message ?? null;
  } else if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code);
    error = r.error?.message ?? null;
  } else {
    error = 'Lien incomplet';
  }
  if (error) return NextResponse.redirect(`${origin}/login?erreur=${encodeURIComponent(error)}`);
  return NextResponse.redirect(`${origin}${safeNext}`);
}
