export const metadata = { title: 'Configuration requise — Sentinel' };

/** Affichée tant que les variables Supabase ne sont pas définies. */
export default function ConfigurationPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-xl font-semibold">Configuration requise</h1>
      <p className="mt-2 text-sm text-muted">
        L’application n’est pas encore reliée à sa base de données. Définissez les variables d’environnement <code>NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
        <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> et <code>SUPABASE_SECRET_KEY</code> (voir le README, section « Déploiement »), puis redéployez.
      </p>
    </main>
  );
}
