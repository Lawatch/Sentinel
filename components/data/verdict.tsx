import type { Confidence, Verdict } from '@/lib/finance/types';
import { VERDICT_LABELS } from '@/lib/finance/types';
import { cn } from '@/components/ui/cn';

const V: Record<Verdict, string> = {
  a_visiter: 'bg-v-visiter text-white',
  a_negocier: 'bg-v-negocier text-white',
  hors_criteres: 'bg-v-hors text-white',
  donnees_insuffisantes: 'bg-v-insuffisant text-white',
};

export function VerdictBadge({ verdict, size = 'md' }: { verdict: Verdict | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!verdict) return <span className="text-xs text-muted">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-semibold',
        V[verdict],
        size === 'sm' && 'px-1.5 py-0.5 text-[11px]',
        size === 'md' && 'px-2 py-1 text-xs',
        size === 'lg' && 'px-3 py-1.5 text-sm',
      )}
    >
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

const C: Record<Confidence, string> = {
  A: 'border-success/50 text-success',
  B: 'border-warning/50 text-warning',
  C: 'border-danger/50 text-danger',
};

export function ConfidenceBadge({ niveau, title }: { niveau: Confidence | null; title?: string }) {
  if (!niveau) return <span className="text-xs text-muted">—</span>;
  return (
    <span title={title ?? `Confiance ${niveau}`} className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold', C[niveau])}>
      {niveau}
    </span>
  );
}
