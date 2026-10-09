import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/server/api';
import { serverDeps } from '@/lib/server/deps';
import { communesForZone } from '@/lib/server/sources';
import { MAX_COMMUNES_PER_ZONE } from '@/lib/domain/zones';

export const maxDuration = 60;

/** Communes intersectées par un polygone (au plus 30). */
export async function POST(req: Request) {
  const auth = await apiUser({ key: 'zones', max: 30, windowMs: 60_000 });
  if ('error' in auth) return auth.error;
  const { geojson } = (await req.json().catch(() => ({}))) as { geojson?: { type: string; coordinates: unknown } };
  if (!geojson || !['Polygon', 'MultiPolygon'].includes(geojson.type)) return NextResponse.json({ error: 'Polygone attendu' }, { status: 400 });
  try {
    const r = await communesForZone(serverDeps(), geojson as never);
    if (r.tropGrande)
      return NextResponse.json(
        { error: `Zone trop grande${r.nombre ? ` (${r.nombre} communes)` : ''} : réduisez-la à ${MAX_COMMUNES_PER_ZONE} communes au maximum.` },
        { status: 422 },
      );
    return NextResponse.json({ communes: r.communes, features: r.features });
  } catch (e) {
    return NextResponse.json({ error: `Découpage communal indisponible : ${(e as Error).message}` }, { status: 502 });
  }
}

/** Contours des communes d'une zone enregistrée (depuis le cache). */
export async function GET(req: Request) {
  const auth = await apiUser();
  if ('error' in auth) return auth.error;
  const codes = (new URL(req.url).searchParams.get('codes') ?? '').split(',').filter(Boolean).slice(0, MAX_COMMUNES_PER_ZONE);
  const deps = serverDeps();
  const deps2 = new Set(codes.map((c) => (c.startsWith('97') ? c.slice(0, 3) : c.slice(0, 2))));
  const features = [];
  const { departmentContours } = await import('@/lib/server/sources');
  try {
    for (const dep of deps2) {
      const fc = await departmentContours(deps, dep);
      features.push(...fc.features.filter((f) => codes.includes(String(f.properties?.code))));
    }
    return NextResponse.json({ features });
  } catch (e) {
    return NextResponse.json({ error: `Contours indisponibles : ${(e as Error).message}` }, { status: 502 });
  }
}
