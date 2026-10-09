import { NextResponse } from 'next/server';
import { parseProfile, profileFor } from '@/lib/domain/property';
import { apiUser } from '@/lib/server/api';
import { serverDeps } from '@/lib/server/deps';
import { radarCommune } from '@/lib/server/sources';

export const maxDuration = 60;

/** Rendement brut théorique d'une commune pour la couche « Marché ». */
export async function POST(req: Request) {
  const auth = await apiUser({ key: 'radar', max: 120, windowMs: 60_000 });
  if ('error' in auth) return auth.error;
  const { code, type = 'appartement' } = (await req.json().catch(() => ({}))) as { code?: string; type?: 'appartement' | 'maison' };
  if (!code || !/^\d[\dAB]\d{3}$/.test(code)) return NextResponse.json({ error: 'Code INSEE invalide' }, { status: 400 });
  const { data } = await auth.supabase.from('profiles').select('id,nom,params,par_defaut');
  const profile = profileFor({ profile_id: null, type_actif: type }, (data ?? []).map(parseProfile));
  const r = await radarCommune(serverDeps(), code, type, profile.params.charges_recuperables_m2_mois);
  return NextResponse.json({ ...r, charges_recup_m2: profile.params.charges_recuperables_m2_mois });
}
