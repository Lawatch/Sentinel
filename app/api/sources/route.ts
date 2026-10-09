import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/server/api';
import { serverDeps } from '@/lib/server/deps';
import { checkSources } from '@/lib/server/health';

export const maxDuration = 30;

/** Teste chaque source publique (appel léger) et enregistre le résultat. */
export async function POST() {
  const auth = await apiUser({ key: 'sources', max: 6, windowMs: 60_000 });
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json({ resultats: await checkSources(serverDeps()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
