import { analyzeProperty, parseProperty, profileFor } from '@/lib/domain/property';
import { ensureProfiles } from '@/lib/server/data';
import { requireUser } from '@/lib/supabase/server';
import { CompareView } from '@/components/compare/compare-view';

export const metadata = { title: 'Comparateur — Sentinel' };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const sp = await searchParams;
  const ids = (sp.ids ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 4);
  const { supabase } = await requireUser();
  const profiles = await ensureProfiles(supabase);
  const { data: all } = await supabase.from('properties').select('id,titre,adresse,demo').order('created_at', { ascending: false });
  const { data } = ids.length ? await supabase.from('properties').select('*').in('id', ids) : { data: [] };
  const items = (data ?? [])
    .map(parseProperty)
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    .map((p) => {
      const profile = profileFor(p, profiles);
      return { p, a: analyzeProperty(p, profile), profil: profile.nom };
    });
  return <CompareView items={items} all={(all ?? []).map((x) => ({ id: x.id, titre: x.titre || x.adresse, demo: x.demo }))} ids={ids} />;
}
