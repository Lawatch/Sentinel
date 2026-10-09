'use client';

import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import type { Alert, Analysis } from '@/lib/finance/analyze';
import { IndicatorValue } from '@/components/data/indicator';
import { ConfidenceBadge, VerdictBadge } from '@/components/data/verdict';
import { fmtEur, fmtNum, fmtPct } from '@/components/data/format';
import { cn } from '@/components/ui/cn';

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <div className="text-lg leading-tight">{children}</div>
    </div>
  );
}

export function AlertList({ alertes, max }: { alertes: Alert[]; max?: number }) {
  const order = { bloquant: 0, alerte: 1, info: 2 } as const;
  const list = [...alertes].sort((a, b) => order[a.niveau] - order[b.niveau]).slice(0, max);
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((a, i) => (
        <li
          key={i}
          className={cn(
            'flex items-start gap-2 rounded-md px-2.5 py-1.5 text-sm',
            a.niveau === 'bloquant' && 'bg-danger/10 text-danger',
            a.niveau === 'alerte' && 'bg-warning/10 text-warning',
            a.niveau === 'info' && 'bg-surface-2 text-muted',
          )}
        >
          {a.niveau === 'bloquant' ? <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" /> : a.niveau === 'alerte' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>
            {a.niveau === 'bloquant' ? <strong>Bloquant : </strong> : null}
            {a.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** En-tête de verdict (section 8) : un verdict lisible, quatre chiffres et un niveau de confiance. */
export function VerdictHeader({ a }: { a: Analysis }) {
  if (a.kind === 'hors_perimetre') {
    return <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">{a.message}</div>;
  }
  const verdict = a.verdict;
  return (
    <div className="flex flex-col gap-3" data-testid="verdict">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={verdict.verdict} size="lg" />
        <span className="text-sm text-muted">{verdict.raisons.join(' · ')}</span>
      </div>
      {a.kind === 'fonds' ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile label="Couverture de la dette">
            <IndicatorValue ind={a.indicateurs.couverture} title="Couverture de la dette" format={(v) => fmtNum(v, 2)} tone={(v) => (v >= 1.25 ? 'pos' : v < 1 ? 'neg' : 'neutral')} />
          </Tile>
          <Tile label="Trésorerie après dette">
            <IndicatorValue ind={a.indicateurs.tresorerie} title="Trésorerie annuelle après rémunération et dette" format={(v) => `${fmtEur(v)} / an`} tone={(v) => (v >= 0 ? 'pos' : 'neg')} />
          </Tile>
          <Tile label="Prix / EBE retraité">
            <IndicatorValue ind={a.indicateurs.prix_sur_ebe} title="Prix / EBE retraité" format={(v) => `${fmtNum(v, 2)} ×`} />
          </Tile>
          <Tile label="Confiance">
            <div className="flex items-center gap-2">
              <ConfidenceBadge niveau={a.confiance.niveau} />
              <span className="text-xs text-muted">{a.confiance.raisons.join(' · ')}</span>
            </div>
          </Tile>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile label="Cash-flow prudent avant impôt">
            <IndicatorValue
              ind={a.header.cash_flow_prudent}
              title="Cash-flow mensuel prudent, après crédit, avant impôt"
              format={(v) => `${fmtEur(v)} / mois`}
              tone={(v) => (v >= 0 ? 'pos' : 'neg')}
            />
          </Tile>
          <Tile label="Prix d’offre maximal">
            <IndicatorValue ind={a.header.prix_max} title="Prix d’offre maximal" format={(v) => fmtEur(v)} />
            {a.offre.resultat?.atteignable ? <span className="text-xs text-muted">{fmtPct(a.offre.resultat.ecart, 1, true)} vs prix demandé</span> : null}
          </Tile>
          <Tile label="Prix au m² vs médiane DVF">
            <IndicatorValue ind={a.ecart_dvf} title="Écart du prix au m² à la médiane DVF" format={(v) => fmtPct(v, 1, true)} tone={(v) => (v <= 0 ? 'pos' : v > 0.1 ? 'neg' : 'neutral')} />
          </Tile>
          <Tile label="Confiance">
            <div className="flex items-center gap-2">
              <ConfidenceBadge niveau={a.confiance.niveau} />
              <span className="text-xs leading-snug text-muted">{a.confiance.raisons.join(' · ')}</span>
            </div>
          </Tile>
        </div>
      )}
      <AlertList alertes={a.alertes} />
    </div>
  );
}
