import { NextResponse } from 'next/server';
import { buildBackup } from '@/lib/domain/backup';
import { apiUser } from '@/lib/server/api';

/** Export JSON complet des tables du propriétaire (restauration idempotente dans Réglages). */
export async function GET() {
  const auth = await apiUser();
  if ('error' in auth) return auth.error;
  const s = auth.supabase;
  const [profiles, zones, properties, price_observations, import_jobs] = await Promise.all([
    s.from('profiles').select('*'),
    s.from('zones').select('*'),
    s.from('properties').select('*'),
    s.from('price_observations').select('*'),
    s.from('import_jobs').select('*'),
  ]);
  const err = [profiles, zones, properties, price_observations, import_jobs].find((r) => r.error);
  if (err?.error) return NextResponse.json({ error: err.error.message }, { status: 500 });
  const backup = buildBackup({
    profiles: profiles.data ?? [],
    zones: zones.data ?? [],
    properties: properties.data ?? [],
    price_observations: price_observations.data ?? [],
    import_jobs: import_jobs.data ?? [],
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(backup, null, 1), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="sentinel-sauvegarde-${date}.json"` },
  });
}
