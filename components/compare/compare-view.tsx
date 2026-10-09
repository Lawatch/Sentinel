'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import type { Analysis } from '@/lib/finance/analyze';
import type { PropertyRow } from '@/lib/domain/property';
import { ASSET_TYPE_LABELS } from '@/lib/finance/schema';
import type { Indicator } from '@/lib/finance/types';
import { ConfidenceBadge, VerdictBadge } from '@/components/data/verdict';
import { DemoBadge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { fmtEur, fmtNum, fmtPct } from '@/components/data/format';
import { cn } from '@/components/ui/cn';

type Item = { p: PropertyRow; a: Analysis; profil: string };
type Row = { label: string; get: (i: Item) => number | null; fmt: (v: number) => string; better?: 'high' | 'low' };

const ind = (i: Indicator | undefined) => (i && i.ok ? i.valeur : null);
const rental = (a: Analysis) => (a.kind === 'residentiel' || a.kind === 'murs' ? a : null);

const ROWS: Row[] = [
  { label: 'Prix demandé', get: (i) => i.p.inputs.prix.valeur, fmt: (v) => fmtEur(v), better: 'low' },
  { label: 'Surface', get: (i) => i.p.inputs.surface.valeur, fmt: (v) => `${fmtNum(v, 1)} m²` },
  { label: 'Prix au m²', get: (i) => (i.p.inputs.prix.valeur && i.p.inputs.surface.valeur ? i.p.inputs.prix.valeur / i.p.inputs.surface.valeur : null), fmt: (v) => `${fmtNum(v)} €/m²`, better: 'low' },
  { label: 'Écart à la médiane DVF', get: (i) => ind(rental(i.a)?.ecart_dvf), fmt: (v) => fmtPct(v, 1, true), better: 'low' },
  { label: 'Loyer retenu (central)', get: (i) => rental(i.a)?.scenarios.central.hypotheses[0].valeur ?? null, fmt: (v) => `${fmtEur(v)}/mois`, better: 'high' },
  { label: 'Cash-flow prudent avant impôt', get: (i) => {
      if (i.a.kind !== 'fonds') return ind(rental(i.a)?.header.cash_flow_prudent);
      const t = ind(i.a.indicateurs.tresorerie);
      return t === null ? null : t / 12;
    }, fmt: (v) => `${fmtEur(v)}/mois`, better: 'high' },
  { label: 'Cash-flow central avant impôt', get: (i) => ind(rental(i.a)?.scenarios.central.indicateurs.cf_apres_credit), fmt: (v) => `${fmtEur(v)}/mois`, better: 'high' },
  { label: 'Cash-flow central après impôt', get: (i) => ind(rental(i.a)?.scenarios.central.indicateurs.cf_apres_impot), fmt: (v) => `${fmtEur(v)}/mois`, better: 'high' },
  { label: 'Prix d’offre maximal', get: (i) => (i.a.kind === 'fonds' ? ind(i.a.offre.indicateur) : ind(rental(i.a)?.header.prix_max)), fmt: (v) => fmtEur(v) },
  {
    label: 'Écart du prix maximal au prix demandé',
    get: (i) => {
      const pm = i.a.kind === 'fonds' ? ind(i.a.offre.indicateur) : ind(rental(i.a)?.header.prix_max);
      const px = i.p.inputs.prix.valeur;
      return pm !== null && px ? (pm - px) / px : null;
    },
    fmt: (v) => fmtPct(v, 1, true),
    better: 'high',
  },
  { label: 'Rendement brut (central)', get: (i) => ind(rental(i.a)?.scenarios.central.indicateurs.rendement_brut), fmt: (v) => fmtPct(v), better: 'high' },
  { label: 'Rendement net (central)', get: (i) => ind(rental(i.a)?.scenarios.central.indicateurs.rendement_net), fmt: (v) => fmtPct(v), better: 'high' },
  { label: 'Coût total du projet (central)', get: (i) => ind(rental(i.a)?.scenarios.central.indicateurs.cout_total), fmt: (v) => fmtEur(v), better: 'low' },
  { label: 'Enrichissement à 10 ans', get: (i) => ind(rental(i.a)?.enrichissement_10ans), fmt: (v) => fmtEur(v), better: 'high' },
  { label: 'Couverture de la dette (fonds)', get: (i) => (i.a.kind === 'fonds' ? ind(i.a.indicateurs.couverture) : null), fmt: (v) => fmtNum(v, 2), better: 'high' },
];

export function CompareView({ items, all, ids }: { items: Item[]; all: { id: string; titre: string; demo: boolean }[]; ids: string[] }) {
  const router = useRouter();
  const go = (next: string[]) => router.push(`/comparer${next.length ? `?ids=${next.join(',')}` : ''}`);
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comparateur</h1>
          <p className="text-sm text-muted">2 à 4 biens sur les mêmes indicateurs. Le meilleur et le moins bon chiffre de chaque ligne sont mis en évidence.</p>
        </div>
        {ids.length < 4 ? (
          <Select className="w-72" value="" onChange={(e) => e.target.value && go([...ids, e.target.value])} aria-label="Ajouter un bien">
            <option value="">+ Ajouter un bien à la comparaison</option>
            {all
              .filter((x) => !ids.includes(x.id))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.titre}
                  {x.demo ? ' (DÉMO)' : ''}
                </option>
              ))}
          </Select>
        ) : null}
      </div>
      {items.length < 2 ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          Choisissez au moins deux biens (ici ou en les cochant dans la liste de l’écran d’accueil).
        </p>
      ) : null}
      {items.length ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm" data-testid="comparateur">
            <thead>
              <tr className="border-b border-border">
                <th className="w-56 p-3" />
                {items.map(({ p, a, profil }) => (
                  <th key={p.id} className="p-3 text-left align-top font-normal">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/biens/${p.id}`} className="font-semibold hover:underline">
                        {p.titre || p.adresse}
                      </Link>
                      <button aria-label="Retirer" className="text-muted hover:text-danger" onClick={() => go(ids.filter((x) => x !== p.id))}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted">
                      {ASSET_TYPE_LABELS[p.type_actif]} · profil « {profil} »
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {a.kind === 'hors_perimetre' ? <span className="text-xs text-warning">Hors périmètre</span> : <VerdictBadge verdict={a.verdict.verdict} size="sm" />}
                      {a.kind !== 'hors_perimetre' ? <ConfidenceBadge niveau={a.confiance.niveau} /> : null}
                      {p.demo ? <DemoBadge /> : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const values = items.map((i) => r.get(i));
                const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
                if (nums.length === 0) return null;
                const best = r.better ? (r.better === 'high' ? Math.max(...nums) : Math.min(...nums)) : null;
                const worst = r.better ? (r.better === 'high' ? Math.min(...nums) : Math.max(...nums)) : null;
                return (
                  <tr key={r.label} className="border-b border-border last:border-0">
                    <th className="p-3 text-left text-xs font-medium text-muted">{r.label}</th>
                    {values.map((v, k) => (
                      <td
                        key={k}
                        className={cn(
                          'p-3',
                          nums.length > 1 && v === best && best !== worst && 'bg-success/10 font-semibold text-success',
                          nums.length > 1 && v === worst && best !== worst && 'bg-danger/5 text-danger',
                        )}
                      >
                        {v === null || !Number.isFinite(v) ? <span className="text-muted">non calculable</span> : r.fmt(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="border-b border-border">
                <th className="p-3 text-left text-xs font-medium text-muted">DPE</th>
                {items.map(({ p }) => (
                  <td key={p.id} className="p-3">
                    {p.inputs.dpe.classe.valeur ?? <span className="text-muted">inconnu</span>}
                  </td>
                ))}
              </tr>
              <tr>
                <th className="p-3 text-left align-top text-xs font-medium text-muted">Points bloquants et alertes</th>
                {items.map(({ p, a }) => (
                  <td key={p.id} className="p-3 align-top text-xs">
                    {a.kind === 'hors_perimetre'
                      ? a.message
                      : a.alertes
                          .filter((x) => x.niveau !== 'info')
                          .map((x, i) => (
                            <p key={i} className={x.niveau === 'bloquant' ? 'text-danger' : 'text-warning'}>
                              {x.message}
                            </p>
                          ))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
