import { notFound } from 'next/navigation';
import { parseProperty, type PriceObservationRow } from '@/lib/domain/property';
import { ensureProfiles } from '@/lib/server/data';
import { requireUser } from '@/lib/supabase/server';
import { PropertyView } from '@/components/property/property-view';

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ enrichir?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();
  const [profiles, row, obs] = await Promise.all([
    ensureProfiles(supabase),
    supabase.from('properties').select('*').eq('id', id).maybeSingle(),
    supabase.from('price_observations').select('id,property_id,date,prix,origine').eq('property_id', id).order('date'),
  ]);
  if (!row.data) notFound();
  const p = parseProperty(row.data);
  const observations = (obs.data ?? []).map((o) => ({ ...o, prix: Number(o.prix) })) as PriceObservationRow[];
  return <PropertyView key={p.id} p={p} observations={observations} profiles={profiles} autoEnrich={sp.enrichir === '1'} today={new Date().toISOString().slice(0, 10)} />;
}
