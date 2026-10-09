'use client';

import { useState } from 'react';
import type { FondsAnalysis, RentalAnalysis, ScenarioResult } from '@/lib/finance/analyze';
import { yearlySummary } from '@/lib/finance/credit';
import { FISCAL_REGIME_LABELS, type ProfileParams } from '@/lib/finance/schema';
import type { Indicator, ScenarioName } from '@/lib/finance/types';
import { HowComputed, IndicatorValue, TermsTable } from '@/components/data/indicator';
import { StatusPill } from '@/components/data/status';
import { fmtEur, fmtNum, fmtPct } from '@/components/data/format';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';

const SCEN: { key: ScenarioName; label: string }[] = [
  { key: 'prudent', label: 'Prudent' },
  { key: 'central', label: 'Central' },
  { key: 'favorable', label: 'Favorable' },
];

function Cell({ ind, format, title, tone }: { ind: Indicator; format: (v: number) => string; title: string; tone?: boolean }) {
  return (
    <td className="px-2 py-2 align-top">
      <IndicatorValue ind={ind} format={format} title={title} tone={tone ? (v) => (v >= 0 ? 'pos' : 'neg') : undefined} />
    </td>
  );
}

function HypCell({ s, i, format }: { s: ScenarioResult; i: number; format: (v: number) => string }) {
  const h = s.hypotheses[i];
  return (
    <td className="px-2 py-2 align-top">
      <div className="flex items-center gap-1.5">
        <span className={cn('font-medium', h.valeur === null && 'text-muted')}>{h.valeur === null ? 'inconnu' : format(h.valeur)}</span>
        <StatusPill statut={h.statut} compact source={h.source} />
      </div>
      {h.source ? <span className="block break-words text-[11px] leading-tight text-muted">{h.source}</span> : null}
    </td>
  );
}

export function RentalResults({ a, profile }: { a: RentalAnalysis; profile: ProfileParams }) {
  const [showAmort, setShowAmort] = useState(false);
  const sc = SCEN.map((x) => a.scenarios[x.key]);
  const rows: { label: string; render: (s: ScenarioResult) => React.ReactNode }[] = [
    { label: 'Loyer retenu (HC / mois)', render: (s) => <HypCell s={s} i={0} format={(v) => fmtEur(v)} /> },
    { label: 'Vacance', render: (s) => <HypCell s={s} i={1} format={(v) => fmtPct(v, 1)} /> },
    { label: 'Travaux', render: (s) => <HypCell s={s} i={2} format={(v) => fmtEur(v)} /> },
    { label: 'Taux nominal', render: (s) => <HypCell s={s} i={3} format={(v) => fmtPct(v, 2)} /> },
    { label: 'Coût total du projet', render: (s) => <Cell ind={s.indicateurs.cout_total} format={(v) => fmtEur(v)} title="Coût total du projet" /> },
    { label: 'Rendement brut', render: (s) => <Cell ind={s.indicateurs.rendement_brut} format={(v) => fmtPct(v)} title="Rendement brut (dénominateur : prix d’achat)" /> },
    { label: 'Rendement net d’exploitation', render: (s) => <Cell ind={s.indicateurs.rendement_net} format={(v) => fmtPct(v)} title="Rendement net (dénominateur : coût total du projet)" /> },
    { label: 'Cash-flow avant financement', render: (s) => <Cell ind={s.indicateurs.cf_avant_financement} format={(v) => `${fmtEur(v)} / mois`} title="Cash-flow avant financement" tone /> },
    { label: 'Cash-flow après crédit, avant impôt', render: (s) => <Cell ind={s.indicateurs.cf_apres_credit} format={(v) => `${fmtEur(v)} / mois`} title="Cash-flow après crédit, avant impôt" tone /> },
    { label: 'Cash-flow après impôt (année 1)', render: (s) => <Cell ind={s.indicateurs.cf_apres_impot} format={(v) => `${fmtEur(v)} / mois`} title="Cash-flow après impôt, année 1" tone /> },
  ];
  const central = a.scenarios.central;
  const years = central.result && a.amortissement.length ? yearlySummary(a.amortissement, Math.ceil(a.amortissement.length / 12)) : [];
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Scénarios">
          <p className="text-xs text-muted">Paramètres des scénarios modifiables dans le profil. Chaque chiffre indique son origine.</p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-sm" data-testid="scenarios">
            <colgroup>
              <col className="w-48" />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-2 py-2 font-medium" />
                {SCEN.map((x) => (
                  <th key={x.key} className="px-2 py-2 font-semibold text-fg">
                    {x.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border last:border-0">
                  <th className="px-2 py-2 text-left align-top text-xs font-medium text-muted">{r.label}</th>
                  {sc.map((s) => (
                    <FragmentCell key={s.nom}>{r.render(s)}</FragmentCell>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Négociation et sensibilité" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">Prix d’offre maximal (scénario prudent, cible {fmtEur(profile.cash_flow_cible)} / mois)</p>
              <IndicatorValue ind={a.offre.indicateur} title="Prix d’offre maximal" format={(v) => fmtEur(v)} />
              {a.offre.resultat?.atteignable ? <p className="text-xs text-muted">soit {fmtPct(a.offre.resultat.ecart, 1, true)} vs le prix demandé</p> : null}
              {a.offre.resultat && !a.offre.resultat.atteignable ? <p className="text-sm text-danger">Objectif inatteignable avec ces hypothèses</p> : null}
            </div>
            <div>
              <p className="text-xs text-muted">Loyer minimal pour un cash-flow nul (central)</p>
              <IndicatorValue ind={a.seuils.loyer_min} title="Seuil de bascule : loyer" format={(v) => `${fmtEur(v)} / mois`} />
            </div>
            <div>
              <p className="text-xs text-muted">Taux de crédit maximal pour un cash-flow nul (central)</p>
              <IndicatorValue ind={a.seuils.taux_max} title="Seuil de bascule : taux" format={(v) => fmtPct(v, 2)} />
            </div>
            <div>
              <p className="text-xs text-muted">Enrichissement à 10 ans (sans revente)</p>
              <IndicatorValue ind={a.enrichissement_10ans} title="Enrichissement à 10 ans" format={(v) => fmtEur(v)} tone={(v) => (v >= 0 ? 'pos' : 'neg')} />
            </div>
            {a.endettement ? (
              <div>
                <p className="text-xs text-muted">Taux d’endettement (HCSF {fmtPct(profile.hcsf.taux_max, 0)})</p>
                <IndicatorValue ind={a.endettement} title="Taux d’endettement" format={(v) => fmtPct(v, 2)} tone={(v) => (v <= profile.hcsf.taux_max ? 'pos' : 'neg')} />
              </div>
            ) : (
              <p className="text-xs text-muted">Finançabilité : renseignez les revenus du foyer dans le profil pour calculer le taux d’endettement.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Fiscalité simplifiée (année 1)" />
          <CardBody className="text-sm">
            {central.impot ? (
              <>
                <p className="mb-1 text-xs text-muted">
                  Régime : {FISCAL_REGIME_LABELS[profile.regime_fiscal]} · TMI {fmtPct(profile.tmi ?? 0, 0)} · scénario central
                </p>
                <TermsTable termes={[...central.impot.detail.map((d) => ({ label: d.label, valeur: d.montant, unite: '€/an' as const })), { label: 'Base imposable', valeur: central.impot.base, unite: '€/an' }, { label: 'Impôt estimé', valeur: central.impot.impot, unite: '€/an' }]} />
                {central.impot.notes.map((n) => (
                  <p key={n} className="mt-1 text-xs text-muted">
                    {n}
                  </p>
                ))}
              </>
            ) : (
              <p className="text-muted">Renseignez un régime fiscal et une TMI dans le profil pour estimer l’impôt.</p>
            )}
            <p className="mt-3 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">Estimation simplifiée, à valider avec un conseil. Ni report pluriannuel de déficit ni fiscalité de revente.</p>
          </CardBody>
        </Card>
      </div>

      {central.result ? (
        <Card>
          <CardHeader
            title="Coût du projet et financement (central)"
            action={
              years.length ? (
                <button className="text-xs text-accent hover:underline no-print" onClick={() => setShowAmort(!showAmort)}>
                  {showAmort ? 'Masquer' : 'Afficher'} le tableau d’amortissement
                </button>
              ) : null
            }
          />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <TermsTable termes={central.result.cout_lignes.map((l) => ({ label: l.label, valeur: l.montant, unite: '€' as const })).concat([{ label: 'Coût total', valeur: central.result.cout_total, unite: '€' }])} />
            <TermsTable
              termes={[
                { label: 'Apport', valeur: profile.apport, unite: '€', statut: 'hypothese' },
                { label: 'Capital emprunté', valeur: central.result.capital, unite: '€' },
                { label: `Mensualité hors assurance (${profile.duree_credit_mois} mois)`, valeur: central.result.mensualite, unite: '€/mois' },
                { label: 'Assurance emprunteur (année 1)', valeur: central.result.assurance_annuelle, unite: '€/an' },
                { label: 'Intérêts (année 1)', valeur: central.result.interets_annee1, unite: '€/an' },
              ]}
            />
            {showAmort ? (
              <div className="overflow-x-auto md:col-span-2">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="py-1 pr-2">Année</th>
                      <th className="py-1 pr-2 text-right">Mensualités</th>
                      <th className="py-1 pr-2 text-right">dont intérêts</th>
                      <th className="py-1 pr-2 text-right">Capital remboursé</th>
                      <th className="py-1 pr-2 text-right">Assurance</th>
                      <th className="py-1 text-right">Capital restant dû</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((y) => (
                      <tr key={y.annee} className="border-b border-border last:border-0">
                        <td className="py-1 pr-2">{y.annee}</td>
                        <td className="py-1 pr-2 text-right">{fmtEur(y.mensualites)}</td>
                        <td className="py-1 pr-2 text-right">{fmtEur(y.interets)}</td>
                        <td className="py-1 pr-2 text-right">{fmtEur(y.capital_rembourse)}</td>
                        <td className="py-1 pr-2 text-right">{fmtEur(y.assurance)}</td>
                        <td className="py-1 text-right">{fmtEur(y.capital_restant_fin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

const FragmentCell = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export function FondsResults({ a }: { a: FondsAnalysis }) {
  const r = a.resultat;
  if (!r) {
    return (
      <Card>
        <CardBody className="text-sm text-muted">Non calculable : manque {a.manquants.join(', ').toLowerCase()}.</CardBody>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Besoin de financement" action={<HowComputed ind={a.indicateurs.besoin_total} title="Besoin total de financement" />} />
          <CardBody>
            <TermsTable termes={[...r.besoin_lignes.map((l) => ({ label: l.label, valeur: l.montant, unite: '€' as const })), { label: 'Besoin total', valeur: r.besoin_total, unite: '€' }, { label: 'Apport nécessaire (besoin − prêt)', valeur: r.apport_necessaire, unite: '€' }, { label: 'Mensualité du prêt', valeur: r.mensualite, unite: '€/mois' }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Ratios (descriptifs)">
            <p className="text-xs text-muted">Aucun multiple « de marché » n’est affiché sans comparables documentés.</p>
          </CardHeader>
          <CardBody>
            <TermsTable
              termes={[
                { label: 'Évolution du CA', valeur: r.ratios.evolution_ca === null ? null : r.ratios.evolution_ca * 100, unite: '%' },
                { label: 'EBE / CA', valeur: r.ratios.ebe_sur_ca * 100, unite: '%' },
                { label: 'Loyer / CA', valeur: r.ratios.loyer_sur_ca * 100, unite: '%' },
                { label: 'Masse salariale / CA', valeur: r.ratios.masse_salariale_sur_ca === null ? null : r.ratios.masse_salariale_sur_ca * 100, unite: '%' },
                { label: 'Prix / CA', valeur: r.ratios.prix_sur_ca, unite: '' },
                { label: 'Prix / EBE retraité', valeur: r.ratios.prix_sur_ebe_retraite, unite: '' },
                { label: 'EBE retraité', valeur: r.ebe_retraite, unite: '€/an' },
              ]}
            />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Scénarios d’activité (charges fixes constantes)" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-3 py-2">Scénario</th>
                <th className="px-3 py-2 text-right">CA</th>
                <th className="px-3 py-2 text-right">EBE retraité</th>
                <th className="px-3 py-2 text-right">Couverture</th>
                <th className="px-3 py-2 text-right">Trésorerie après dette</th>
              </tr>
            </thead>
            <tbody>
              {r.scenarios.map((s) => (
                <tr key={s.label} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{s.label}</td>
                  <td className="px-3 py-2 text-right">{fmtEur(s.ca)}</td>
                  <td className="px-3 py-2 text-right">{fmtEur(s.ebe_retraite)}</td>
                  <td className={cn('px-3 py-2 text-right', s.couverture < 1 && 'text-danger')}>{fmtNum(s.couverture, 2)}</td>
                  <td className={cn('px-3 py-2 text-right', s.tresorerie < 0 ? 'text-danger' : 'text-success')}>{fmtEur(s.tresorerie)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="grid gap-4 border-t border-border sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted">Point mort (CA minimal pour une trésorerie nulle)</p>
            <IndicatorValue ind={a.indicateurs.point_mort} title="Point mort" format={(v) => `${fmtEur(v)} / an`} />
          </div>
          <div>
            <p className="text-xs text-muted">Prix maximal (trésorerie du scénario CA −10 % = cible)</p>
            <IndicatorValue ind={a.offre.indicateur} title="Prix de cession maximal" format={(v) => fmtEur(v)} />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
