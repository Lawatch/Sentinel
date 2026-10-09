'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const allowed = (email: string) => {
  const list = (process.env.APP_OWNER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(email.toLowerCase());
};

/** Envoie le lien magique (et le code à 6 chiffres) par e-mail. */
export async function sendMagicLink(email: string, next: string | null): Promise<{ ok: boolean; error?: string }> {
  const e = email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: 'Adresse e-mail invalide.' };
  // Réponse identique pour une adresse non autorisée : on ne révèle pas la liste.
  if (!allowed(e)) return { ok: true };
  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  // Flux « implicite » : le lien de l'e-mail ne dépend pas d'un cookie posé par ce navigateur, il fonctionne
  // donc aussi ouvert depuis l'application de messagerie du téléphone (voir app/auth/callback).
  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const { error } = await supabase.auth.signInWithOtp({
    email: e,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
  });
  if (error) {
    if (/rate limit/i.test(error.message)) return { ok: false, error: 'Trop d’e-mails envoyés récemment : patientez quelques minutes ou utilisez le dernier code reçu.' };
    if (/signups? not allowed|not found/i.test(error.message)) return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Connexion par le code à 6 chiffres reçu par e-mail. */
export async function verifyCode(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) return { ok: false, error: 'Code invalide ou expiré.' };
  return { ok: true };
}
