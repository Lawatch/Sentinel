'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Retour du lien magique de l'e-mail par défaut de Supabase (offre gratuite : modèle non modifiable).
 * Le lien porte la session dans le fragment d'URL (#access_token=…), lisible seulement par le navigateur :
 * il fonctionne donc même ouvert dans un autre navigateur que celui de la demande.
 */
export default function AuthCallback() {
  useEffect(() => {
    const { search, hash } = window.location;
    const query = new URLSearchParams(search);
    const next = query.get('next');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    const fail = (msg: string) => window.location.replace(`/login?erreur=${encodeURIComponent(msg)}`);
    // Lien PKCE ou modèle personnalisé : traités côté serveur.
    if (query.get('code') || query.get('token_hash')) {
      window.location.replace(`/auth/confirm${search}`);
      return;
    }
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const error = params.get('error_description') ?? query.get('error_description');
    if (error) return fail(error.includes('expired') || error.includes('invalid') ? 'Lien expiré ou déjà utilisé : demandez-en un nouveau.' : error);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return fail('Lien incomplet');
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error: e }) => (e ? fail(e.message) : window.location.replace(safeNext)));
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center justify-center p-4">
      <p className="text-sm text-muted" role="status">
        Connexion en cours…
      </p>
    </main>
  );
}
