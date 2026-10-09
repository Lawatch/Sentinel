import { NextResponse } from 'next/server';
import { parseProperty } from '@/lib/domain/property';
import { apiUser } from '@/lib/server/api';
import { serverDeps } from '@/lib/server/deps';
import { enrichProperty } from '@/lib/server/enrich';
import { ASSET_TYPE_LABELS } from '@/lib/finance/schema';

export const maxDuration = 60;

/** Enrichit un bien (géocodage, DVF, loyer, DPE, risques, encadrement). Toujours côté serveur. */
export async function POST(req: Request, ctx: RouteContext<'/api/biens/[id]/enrichir'>) {
  const { id } = await ctx.params;
  const auth = await apiUser({ key: 'enrichir', max: 40, windowMs: 60_000 });
  if ('error' in auth) return auth.error;
  const { supabase } = auth;
  const body = (await req.json().catch(() => ({}))) as { force?: boolean; regeocode?: boolean };
  const { data: row, error } = await supabase.from('properties').select('*').eq('id', id).single();
  if (error || !row) return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
  const p = parseProperty(row);
  let deps;
  try {
    deps = serverDeps();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const t0 = Date.now();
  const patch = await enrichProperty(deps, p, { force: body.force, regeocode: body.regeocode });
  const titre =
    p.titre && !p.titre.endsWith(p.adresse)
      ? p.titre
      : `${ASSET_TYPE_LABELS[p.type_actif]}${p.inputs.surface.valeur ? ` ${Math.round(p.inputs.surface.valeur)} m²` : ''} — ${patch.commune ?? p.commune ?? p.adresse}`;
  const { error: upErr } = await supabase
    .from('properties')
    .update({ ...patch, commune: patch.commune ?? p.commune, titre })
    .eq('id', id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, ms: Date.now() - t0, enrichissement: patch.enrichissement });
}
