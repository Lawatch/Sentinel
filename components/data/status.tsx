import type { FieldStatus } from '@/lib/finance/types';
import { FIELD_STATUS_LABELS } from '@/lib/finance/types';
import { cn } from '@/components/ui/cn';

const COLORS: Record<FieldStatus, string> = {
  declare: 'bg-st-declare',
  verifie: 'bg-st-verifie',
  estime: 'bg-st-estime',
  hypothese: 'bg-st-hypothese',
  inconnu: 'bg-st-inconnu',
};
const TEXT: Record<FieldStatus, string> = {
  declare: 'text-st-declare border-st-declare/40',
  verifie: 'text-st-verifie border-st-verifie/40',
  estime: 'text-st-estime border-st-estime/40',
  hypothese: 'text-st-hypothese border-st-hypothese/40',
  inconnu: 'text-st-inconnu border-st-inconnu/40',
};

/** Pastille de statut affichée à côté de chaque chiffre. */
export function StatusPill({ statut, source, compact = false, className }: { statut: FieldStatus; source?: string | null; compact?: boolean; className?: string }) {
  const title = `${FIELD_STATUS_LABELS[statut]}${source ? ` — ${source}` : ''}`;
  if (compact)
    return <span title={title} aria-label={title} className={cn('inline-block h-2 w-2 shrink-0 rounded-full', COLORS[statut], className)} />;
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide', TEXT[statut], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', COLORS[statut])} />
      {FIELD_STATUS_LABELS[statut]}
    </span>
  );
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted">
      {(Object.keys(FIELD_STATUS_LABELS) as FieldStatus[]).map((s) => (
        <StatusPill key={s} statut={s} />
      ))}
    </div>
  );
}
