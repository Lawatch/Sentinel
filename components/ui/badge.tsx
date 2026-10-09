import * as React from 'react';
import { cn } from './cn';

export function Badge({ className, tone = 'neutral', ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'demo' }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-border',
    accent: 'bg-accent-soft text-accent border-transparent',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    danger: 'bg-danger/10 text-danger border-danger/30',
    demo: 'bg-[#fff1c2] text-[#6b4e00] border-[#e8c65a] font-bold tracking-wide dark:bg-[#3a2f0a] dark:text-[#f3d27a]',
  } as const;
  return <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none', tones[tone], className)} {...props} />;
}

export const DemoBadge = () => (
  <Badge tone="demo" title="Bien de démonstration (données synthétiques)">
    DÉMO
  </Badge>
);
