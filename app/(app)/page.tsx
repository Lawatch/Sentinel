import { summarize } from '@/lib/domain/property';
import { loadAll } from '@/lib/server/data';
import { requireUser } from '@/lib/supabase/server';
import { HomeView, type ZoneRow } from '@/components/home/home-view';

export default async function HomePage() {
  const { supabase } = await requireUser();
  const { profiles, properties, observations, zones } = await loadAll(supabase);
  const summaries = properties.map((p) => summarize(p, profiles, observations));
  const budget = (profiles.find((p) => p.par_defaut) ?? profiles[0])?.params.budget_max ?? null;
  return <HomeView summaries={summaries} zones={zones as ZoneRow[]} budgetDefaut={budget} />;
}
