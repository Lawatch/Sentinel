import { ensureProfiles } from '@/lib/server/data';
import { SOURCES } from '@/lib/server/health';
import { requireUser } from '@/lib/supabase/server';
import { FISCAL_PARAMS, REGULATORY_PARAMS } from '@/lib/finance/fiscal-params';
import { ProfilesEditor } from '@/components/settings/profiles-editor';
import { CsvImport } from '@/components/settings/csv-import';
import { BackupPanel } from '@/components/settings/backup-panel';
import { DemoPanel } from '@/components/settings/demo-panel';
import { SourcesPanel, type SourceStatusRow } from '@/components/settings/sources-panel';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { fmtDateTime } from '@/components/data/format';

export const metadata = { title: 'Réglages — Sentinel' };

const SOURCE_OF: Record<string, string> = {
  dvf: 'dvf',
  dvf_millesime: 'dvf',
  anil: 'anil',
  dpe: 'dpe',
  geocodage: 'geocodage',
  georisques: 'georisques',
  encadrement: 'encadrement',
  encadrement_paris_annee: 'encadrement',
  communes_contours: 'communes',
};

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const [profiles, demo, cache, jobs] = await Promise.all([
    ensureProfiles(supabase),
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('demo', true),
    supabase.from('market_cache').select('source,statut,recupere_le,derniere_tentative,message,payload').order('derniere_tentative', { ascending: false }).limit(2000),
    supabase.from('import_jobs').select('fichier,lignes_acceptees,lignes_rejetees,created_at').order('created_at', { ascending: false }).limit(5),
  ]);
  const rows: SourceStatusRow[] = SOURCES.map((s) => {
    const entries = (cache.data ?? []).filter((c) => SOURCE_OF[c.source] === s.id);
    const ok = entries.filter((c) => c.statut === 'ok' && c.recupere_le).map((c) => c.recupere_le as string).sort().at(-1) ?? null;
    const err = entries.find((c) => c.statut === 'erreur');
    const t = (cache.data ?? []).find((c) => c.source === `sante:${s.id}`);
    return {
      id: s.id,
      nom: s.nom,
      usage: s.usage,
      dernier_succes: ok,
      derniere_erreur: err ? { date: err.derniere_tentative, message: err.message } : null,
      test: t ? (t.payload as SourceStatusRow['test']) : null,
    };
  });
  const P = FISCAL_PARAMS;
  const params: [string, string, string][] = [
    ['Prélèvements sociaux — location nue', `${(P.ps_foncier.valeur * 100).toFixed(1)} %`, P.ps_foncier.source],
    ['Prélèvements sociaux — LMNP', `${(P.ps_lmnp.valeur * 100).toFixed(1)} %`, P.ps_lmnp.source],
    ['Micro-foncier', `abattement ${P.micro_foncier_abattement.valeur * 100} %, plafond ${P.micro_foncier_plafond.valeur.toLocaleString('fr-FR')} €`, P.micro_foncier_plafond.source],
    ['Micro-BIC meublé longue durée', `abattement ${P.micro_bic_meuble_abattement.valeur * 100} %, plafond ${P.micro_bic_meuble_plafond.valeur.toLocaleString('fr-FR')} €`, P.micro_bic_meuble_plafond.source],
    ['Droits de cession de fonds', '0 % ≤ 23 000 € ; 3 % jusqu’à 200 000 € ; 5 % au-delà', P.droits_cession_fonds.source],
    ['Calendrier DPE', 'G interdit (nouveau bail) depuis 2025 ; F en 2028 ; E en 2034', REGULATORY_PARAMS.dpe.source],
    ['HCSF', `${REGULATORY_PARAMS.hcsf.taux_endettement_max * 100} % ; ${REGULATORY_PARAMS.hcsf.duree_max_mois / 12} ans ; loyers à ${REGULATORY_PARAMS.hcsf.ponderation_loyers * 100} %`, REGULATORY_PARAMS.hcsf.source],
  ];
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 py-4 sm:px-4">
      <h1 className="text-xl font-semibold">Réglages</h1>
      <ProfilesEditor profiles={profiles} />
      <CsvImport />
      {jobs.data?.length ? (
        <p className="-mt-2 text-xs text-muted">
          Derniers imports : {jobs.data.map((j) => `${j.fichier} (${fmtDateTime(j.created_at)} : ${j.lignes_acceptees} acceptée(s), ${j.lignes_rejetees} rejetée(s))`).join(' · ')}
        </p>
      ) : null}
      <BackupPanel />
      <SourcesPanel rows={rows} />
      <Card>
        <CardHeader title="Paramètres réglementaires utilisés">
          <p className="text-xs text-muted">Relevés le {P.ps_foncier.verifie_le}, à vérifier sur les sites officiels avant toute décision. Modifiables dans lib/finance/fiscal-params.ts.</p>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              {params.map(([k, v, s]) => (
                <tr key={k} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{k}</td>
                  <td className="px-4 py-2">{v}</td>
                  <td className="px-4 py-2 text-xs text-muted">{s}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
      <DemoPanel count={demo.count ?? 0} />
    </main>
  );
}
