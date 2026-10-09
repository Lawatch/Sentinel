'use client';

import { useState } from 'react';
import { parseNumber } from '@/lib/domain/csv-import';
import type { NumField, StrField } from '@/lib/finance/schema';
import { FIELD_STATUS_LABELS, type FieldStatus } from '@/lib/finance/types';
import { Input, Select } from '@/components/ui/input';
import { StatusPill } from '@/components/data/status';
import { cn } from '@/components/ui/cn';

const STATUSES = Object.keys(FIELD_STATUS_LABELS) as FieldStatus[];

const fmtInput = (v: number | null, ratio?: boolean) =>
  v === null ? '' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: ratio ? 3 : 2, useGrouping: false }).format(ratio ? v * 100 : v);

/**
 * Éditeur d'une valeur { valeur, statut, source } : saisir une valeur la passe à « déclaré »
 * si elle était inconnue ; vider la valeur la remet à « inconnu ».
 */
export function NumFieldEditor({
  label,
  field,
  onChange,
  unit,
  ratio,
  hint,
  className,
  testId,
}: {
  label: string;
  field: NumField;
  onChange: (f: NumField) => void;
  unit?: string;
  ratio?: boolean;
  hint?: string;
  className?: string;
  testId?: string;
}) {
  const [text, setText] = useState(fmtInput(field.valeur, ratio));
  // Valeur modifiée de l'extérieur (annulation, rechargement) : on réaligne le texte saisi.
  const [lastValeur, setLastValeur] = useState(field.valeur);
  if (field.valeur !== lastValeur) {
    setLastValeur(field.valeur);
    const parsed = parseNumber(text);
    const current = parsed === null || Number.isNaN(parsed) ? null : ratio ? parsed / 100 : parsed;
    if (current !== field.valeur) setText(fmtInput(field.valeur, ratio));
  }
  const invalid = text.trim() !== '' && Number.isNaN(parseNumber(text));
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <StatusPill statut={field.statut} source={field.source} />
      </div>
      <div className="flex gap-1">
        <div className="relative flex-1">
          <Input
            data-testid={testId}
            inputMode="decimal"
            value={text}
            aria-invalid={invalid}
            className={cn(unit && 'pr-12', invalid && 'border-danger')}
            onChange={(e) => {
              setText(e.target.value);
              const n = parseNumber(e.target.value);
              if (n === null) onChange({ valeur: null, statut: 'inconnu', source: null, date: null });
              else if (!Number.isNaN(n))
                onChange({ ...field, valeur: ratio ? n / 100 : n, statut: field.statut === 'inconnu' ? 'declare' : field.statut });
            }}
          />
          {unit ? <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">{unit}</span> : null}
        </div>
        <Select
          aria-label={`Statut : ${label}`}
          className="w-28 shrink-0 text-xs"
          value={field.statut}
          onChange={(e) => onChange({ ...field, statut: e.target.value as FieldStatus })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s} disabled={s === 'inconnu' ? field.valeur !== null : field.valeur === null}>
              {FIELD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <Input
        aria-label={`Source : ${label}`}
        className="h-7 text-xs"
        placeholder="Source (annonce, justificatif, échange avec le vendeur…)"
        value={field.source ?? ''}
        onChange={(e) => onChange({ ...field, source: e.target.value || null })}
      />
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function StrFieldEditor({
  label,
  field,
  onChange,
  options,
  className,
}: {
  label: string;
  field: StrField;
  onChange: (f: StrField) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <StatusPill statut={field.statut} source={field.source} />
      </div>
      <div className="flex gap-1">
        <Select
          className="flex-1"
          value={field.valeur ?? ''}
          onChange={(e) =>
            onChange(e.target.value ? { ...field, valeur: e.target.value, statut: field.statut === 'inconnu' ? 'declare' : field.statut } : { valeur: null, statut: 'inconnu' })
          }
        >
          <option value="">Inconnu</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select aria-label={`Statut : ${label}`} className="w-28 shrink-0 text-xs" value={field.statut} onChange={(e) => onChange({ ...field, statut: e.target.value as FieldStatus })}>
          {STATUSES.map((s) => (
            <option key={s} value={s} disabled={s === 'inconnu' ? field.valeur !== null : field.valeur === null}>
              {FIELD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export function DateFieldEditor({ label, field, onChange }: { label: string; field: StrField; onChange: (f: StrField) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <StatusPill statut={field.statut} source={field.source} />
      </div>
      <Input
        type="date"
        value={field.valeur ?? ''}
        onChange={(e) => onChange(e.target.value ? { ...field, valeur: e.target.value, statut: field.statut === 'inconnu' ? 'declare' : field.statut } : { valeur: null, statut: 'inconnu' })}
      />
    </div>
  );
}
