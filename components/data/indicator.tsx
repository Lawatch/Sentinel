'use client';

import { Info } from 'lucide-react';
import type { Indicator, Term } from '@/lib/finance/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/components/ui/cn';
import { fmtUnit } from './format';
import { StatusPill } from './status';

export function HowComputed({ ind, title }: { ind: Indicator; title: string }) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline no-print" aria-label={`Comment c'est calculé : ${title}`}>
        <Info className="h-3 w-3" /> Comment c’est calculé
      </PopoverTrigger>
      <PopoverContent>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 rounded bg-surface-2 px-2 py-1 font-mono text-xs">{ind.formule}</p>
        {ind.ok ? (
          <TermsTable termes={ind.termes} />
        ) : (
          <p className="mt-2 text-xs text-muted">
            Non calculable{ind.manquants.length ? ` — champs manquants : ${ind.manquants.join(', ')}` : ''}.
          </p>
        )}
        {ind.note ? <p className="mt-2 text-xs text-muted">{ind.note}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

export function TermsTable({ termes }: { termes: Term[] }) {
  return (
    <table className="mt-2 w-full text-xs">
      <tbody>
        {termes.map((t, i) => (
          <tr key={i} className="border-t border-border first:border-0">
            <td className="py-1 pr-2 align-top">
              {t.label}
              {t.source ? <span className="block text-[10px] text-muted">{t.source}</span> : null}
            </td>
            <td className="py-1 text-right align-top whitespace-nowrap">
              {fmtUnit(t.valeur, t.unite)} {t.statut ? <StatusPill statut={t.statut} compact className="ml-1 align-middle" /> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Valeur d'un indicateur, ou « non calculable » avec les champs manquants. */
export function IndicatorValue({
  ind,
  format,
  title,
  className,
  tone,
}: {
  ind: Indicator;
  format: (v: number) => string;
  title: string;
  className?: string;
  tone?: (v: number) => 'pos' | 'neg' | 'neutral';
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {ind.ok ? (
        <span
          className={cn(
            'font-semibold',
            tone?.(ind.valeur) === 'pos' && 'text-success',
            tone?.(ind.valeur) === 'neg' && 'text-danger',
          )}
        >
          {format(ind.valeur)}
        </span>
      ) : (
        <span className="text-sm text-muted" title={ind.manquants.length ? `Manque : ${ind.manquants.join(', ')}` : ind.note}>
          non calculable
          {ind.manquants.length ? <span className="block text-[11px]">manque : {ind.manquants.join(', ').toLowerCase()}</span> : ind.note ? <span className="block text-[11px]">{ind.note}</span> : null}
        </span>
      )}
      <HowComputed ind={ind} title={title} />
    </div>
  );
}
