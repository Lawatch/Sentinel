'use client';

import Link from 'next/link';
import type { Analysis, ScenarioResult } from '@/lib/finance/analyze';
import type { PriceHistory } from '@/lib/domain/price-history';
import type { ProfileRow, PropertyRow } from '@/lib/domain/property';
import { ASSET_TYPE_LABELS, FISCAL_REGIME_LABELS } from '@/lib/finance/schema';
import { FIELD_STATUS_LABELS, VERDICT_LABELS, type Indicator } from '@/lib/finance/types';
import { fmtDate, fmtEur, fmtNum, fmtPct } from '@/components/data/format';
import { Button } from '@/components/ui/button';

const v = (i: Indicator, f: (x: number) => string) => (i.ok ? f(i.valeur) : `non calculable${i.ok === false && i.manquants.length ? ` (manque : ${i.manquants.join(', ').toLowerCase()})` : ''}`);

/** Vue imprimable d'une page : fiche pour un banquier ou un associé. */
export function PrintSheet({ p, a, profile, history }: { p: PropertyRow; a: Analysis; profile: ProfileRow; history: PriceHistory }) {
  const fields: [string, { valeur: number | null; statut: keyof typeof FIELD_STATUS_LABELS; source?: string | null }, string][] = [
    ['Prix demandé', p.inputs.prix, '€'],
    ['Surface', p.inputs.surface, 'm²'],
    ['Loyer HC mensuel', p.inputs.loyer, '€'],
    ['Taxe foncière', p.inputs.taxe_fonciere, '€/an'],
    ['Charges de copropriété', p.inputs.charges_copro, '€/an'],
    ['Travaux', p.inputs.travaux, '€'],
  ];
  return (
    <div className="mx-auto max-w-[800px] bg-surface p-6 text-[12px] leading-snug print:max-w-none print:p-0">
      <div className="no-print mb-4 flex gap-2">
        <Button variant="primary" onClick={() => window.print()}>
          Imprimer / enregistrer en PDF
        </Button>
        <Button asChild>
          <Link href={`/biens/${p.id}`}>Retour à la fiche</Link>
        </Button>
      </div>
      <header className="flex items-start justify-between border-b border-border pb-2">
        <div>
          <h1 className="text-lg font-semibold">{p.titre || p.adresse}</h1>
          <p>{p.geocode_label ?? p.adresse}</p>
          <p className="break-all text-muted">{p.url}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold">{a.kind === 'hors_perimetre' ? 'Hors périmètre' : VERDICT_LABELS[a.verdict.verdict]}</p>
          {a.kind !== 'hors_perimetre' ? <p>Confiance {a.confiance.niveau}</p> : null}
          <p className="text-muted">{ASSET_TYPE_LABELS[p.type_actif]}{p.demo ? ' · DÉMO' : ''}</p>
        </div>
      </header>

      {a.kind === 'residentiel' || a.kind === 'murs' ? (
        <>
          <section className="mt-3 grid grid-cols-4 gap-2">
            <Box label="Cash-flow prudent avant impôt" value={v(a.header.cash_flow_prudent, (x) => `${fmtEur(x)}/mois`)} />
            <Box label="Prix d’offre maximal" value={`${v(a.header.prix_max, (x) => fmtEur(x))}${a.offre.resultat?.atteignable ? ` (${fmtPct(a.offre.resultat.ecart, 1, true)})` : ''}`} />
            <Box label="Prix/m² vs médiane DVF" value={v(a.ecart_dvf, (x) => fmtPct(x, 1, true))} />
            <Box label="Enrichissement 10 ans" value={v(a.enrichissement_10ans, (x) => fmtEur(x))} />
          </section>
          <section className="mt-3">
            <h2 className="font-semibold">Scénarios</h2>
            <table className="mt-1 w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th />
                  <th>Prudent</th>
                  <th>Central</th>
                  <th>Favorable</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Loyer HC retenu', (s) => (s.hypotheses[0].valeur === null ? '—' : `${fmtEur(s.hypotheses[0].valeur)}/mois`)],
                    ['Vacance', (s) => fmtPct(s.hypotheses[1].valeur, 1)],
                    ['Coût total', (s) => v(s.indicateurs.cout_total, (x) => fmtEur(x))],
                    ['Rendement brut', (s) => v(s.indicateurs.rendement_brut, (x) => fmtPct(x))],
                    ['Rendement net', (s) => v(s.indicateurs.rendement_net, (x) => fmtPct(x))],
                    ['Cash-flow après crédit', (s) => v(s.indicateurs.cf_apres_credit, (x) => `${fmtEur(x)}/mois`)],
                    ['Cash-flow après impôt (an 1)', (s) => v(s.indicateurs.cf_apres_impot, (x) => `${fmtEur(x)}/mois`)],
                  ] as [string, (s: ScenarioResult) => string][]
                ).map(([label, f]) => (
                  <tr key={label} className="border-b border-border">
                    <td className="py-0.5 pr-2 text-muted">{label}</td>
                    <td>{f(a.scenarios.prudent)}</td>
                    <td>{f(a.scenarios.central)}</td>
                    <td>{f(a.scenarios.favorable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <h2 className="font-semibold">Financement (profil « {profile.nom} »)</h2>
              <p>
                Apport {fmtEur(profile.params.apport)} · taux nominal {fmtPct(profile.params.taux_credit)} · {profile.params.duree_credit_mois} mois · assurance {fmtPct(profile.params.assurance_taux)}
              </p>
              {a.scenarios.central.result ? (
                <p>
                  Capital {fmtEur(a.scenarios.central.result.capital)} · mensualité {fmtEur(a.scenarios.central.result.mensualite, true)} + assurance{' '}
                  {fmtEur(a.scenarios.central.result.assurance_annuelle / 12, true)}
                </p>
              ) : null}
              {a.endettement ? <p>Taux d’endettement : {v(a.endettement, (x) => fmtPct(x))}</p> : null}
              <p>Fiscalité : {FISCAL_REGIME_LABELS[profile.params.regime_fiscal]} (estimation simplifiée, à valider avec un conseil)</p>
            </div>
            <div>
              <h2 className="font-semibold">Données d’entrée</h2>
              <ul>
                {fields.map(([label, f, u]) => (
                  <li key={label}>
                    {label} : {f.valeur === null ? 'inconnu' : `${fmtNum(f.valeur)} ${u}`} <span className="text-muted">({FIELD_STATUS_LABELS[f.statut].toLowerCase()})</span>
                  </li>
                ))}
                <li>
                  DPE : {p.inputs.dpe.classe.valeur ?? 'inconnu'} <span className="text-muted">({FIELD_STATUS_LABELS[p.inputs.dpe.classe.statut].toLowerCase()})</span>
                </li>
              </ul>
            </div>
          </section>
        </>
      ) : null}

      {a.kind === 'fonds' ? (
        <section className="mt-3 grid grid-cols-4 gap-2">
          <Box label="Couverture de la dette" value={v(a.indicateurs.couverture, (x) => fmtNum(x, 2))} />
          <Box label="Trésorerie après dette" value={v(a.indicateurs.tresorerie, (x) => `${fmtEur(x)}/an`)} />
          <Box label="Prix / EBE retraité" value={v(a.indicateurs.prix_sur_ebe, (x) => fmtNum(x, 2))} />
          <Box label="Besoin de financement" value={v(a.indicateurs.besoin_total, (x) => fmtEur(x))} />
        </section>
      ) : null}

      {a.kind === 'hors_perimetre' ? <p className="mt-3">{a.message}</p> : null}

      {a.kind !== 'hors_perimetre' && a.alertes.length ? (
        <section className="mt-3">
          <h2 className="font-semibold">Points d’attention</h2>
          <ul className="list-disc pl-5">
            {a.alertes.map((x, i) => (
              <li key={i}>
                {x.niveau === 'bloquant' ? 'Bloquant : ' : ''}
                {x.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {history.observations.length > 1 ? (
        <p className="mt-2">
          Historique de prix : {history.observations.map((o) => `${fmtEur(o.prix)} (${fmtDate(o.date)})`).join(' → ')}
        </p>
      ) : null}

      <footer className="mt-4 border-t border-border pt-2 text-[10px] text-muted">
        Fiche générée le {fmtDate(new Date().toISOString())} · moteur v{a.version_moteur} · Chaque chiffre est déclaré, vérifié, estimé (source publique) ou hypothèse.
        Sources publiques : DVF (Etalab), carte des loyers (estimations ANIL, à partir des données du Groupe SeLoger et de leboncoin), Géorisques, ADEME. Document d’aide à la décision, sans valeur de conseil.
      </footer>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border p-2">
      <p className="text-[10px] uppercase text-muted">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
