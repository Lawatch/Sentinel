import { analyzeProperty, profileFor } from '@/lib/domain/property';
import { exportCsv } from '@/lib/domain/csv-export';
import { apiUser } from '@/lib/server/api';
import { loadAll } from '@/lib/server/data';

export async function GET() {
  const auth = await apiUser();
  if ('error' in auth) return auth.error;
  const { profiles, properties } = await loadAll(auth.supabase);
  const rows = properties.map((p) => {
    const profile = profileFor(p, profiles);
    return { p, a: analyzeProperty(p, profile), profil: profile.nom };
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(exportCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sentinel-biens-${date}.csv"`,
    },
  });
}
