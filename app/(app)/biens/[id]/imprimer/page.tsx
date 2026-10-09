import { notFound } from 'next/navigation';
import { analyzeProperty, parseProperty, profileFor } from '@/lib/domain/property';
import { priceHistory } from '@/lib/domain/price-history';
import { ensureProfiles } from '@/lib/server/data';
import { requireUser } from '@/lib/supabase/server';
import { PrintSheet } from '@/components/property/print-sheet';

export const metadata = { title: 'Fiche imprimable — Sentinel' };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [profiles, row, obs] = await Promise.all([
    ensureProfiles(supabase),
    supabase.from('properties').select('*').eq('id', id).maybeSingle(),
    supabase.from('price_observations').select('date,prix,origine').eq('property_id', id).order('date'),
  ]);
  if (!row.data) notFound();
  const p = parseProperty(row.data);
  const profile = profileFor(p, profiles);
  const a = analyzeProperty(p, profile);
  const h = priceHistory((obs.data ?? []).map((o) => ({ ...o, prix: Number(o.prix) })));
  return <PrintSheet p={p} a={a} profile={profile} history={h} />;
}
