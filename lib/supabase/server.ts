import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './env';

/** Client lié à la session de l'utilisateur : toutes les requêtes passent par la RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Appelé depuis un composant serveur : le proxy rafraîchit la session.
        }
      },
    },
  });
}

/** Retourne le client et l'utilisateur, ou redirige vers la connexion. */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/login');
  return { supabase, user: data.user };
}
