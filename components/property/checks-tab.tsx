'use client';

import { useState, useTransition } from 'react';
import { markVerified, updateChecklist } from '@/app/actions/properties';
import { CHECKLIST_STATE_LABELS, checklistFor, type ChecklistState, type ChecklistValue } from '@/lib/domain/checklist';
import type { AssetType } from '@/lib/finance/schema';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';

/** Checklist fixe par type d'actif : à faire / OK / problème, avec une note. */
export function ChecksTab({ propertyId, type, checklist }: { propertyId: string; type: AssetType; checklist: ChecklistValue }) {
  const items = checklistFor(type);
  const [state, setState] = useState(checklist);
  const [proposal, setProposal] = useState<{ champ: string; libelle: string; justificatif: string } | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!items.length) return <p className="text-sm text-muted">Pas de checklist pour ce type d’opération (hors périmètre).</p>;
  const done = items.filter((i) => state[i.id]?.etat === 'ok').length;
  const problems = items.filter((i) => state[i.id]?.etat === 'probleme').length;
  const save = (id: string, etat: ChecklistState, note: string) => {
    setState({ ...state, [id]: { etat, note } });
    start(async () => {
      const r = await updateChecklist(propertyId, id, { etat, note });
      if (!r.ok) setMsg(r.error);
    });
  };
  return (
    <Card>
      <CardHeader title="Vérifications">
        <p className="text-xs text-muted">
          {done}/{items.length} OK{problems ? ` · ${problems} problème(s)` : ''}. Cocher « OK » sur un justificatif propose de passer le champ correspondant au statut « vérifié ».
        </p>
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        {proposal ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft p-2 text-sm">
            <span>
              Passer « {proposal.libelle} » au statut <strong>vérifié</strong> (justificatif : {proposal.justificatif}) ?
            </span>
            <Button
              size="sm"
              variant="primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await markVerified(propertyId, proposal.champ, proposal.justificatif);
                  setMsg(r.ok ? `« ${proposal.libelle} » est maintenant vérifié.` : r.error);
                  setProposal(null);
                })
              }
            >
              Oui, passer en vérifié
            </Button>
            <Button size="sm" onClick={() => setProposal(null)}>
              Non
            </Button>
          </div>
        ) : null}
        {items.map((it) => {
          const v = state[it.id] ?? { etat: 'a_faire' as ChecklistState, note: '' };
          return (
            <div key={it.id} className="grid grid-cols-1 items-center gap-2 border-b border-border pb-2 last:border-0 sm:grid-cols-[1fr_8rem_1fr]">
              <span className={cn('text-sm', v.etat === 'ok' && 'text-success', v.etat === 'probleme' && 'text-danger')}>{it.libelle}</span>
              <Select
                aria-label={`État : ${it.libelle}`}
                value={v.etat}
                onChange={(e) => {
                  const etat = e.target.value as ChecklistState;
                  save(it.id, etat, v.note ?? '');
                  if (etat === 'ok' && it.champ) setProposal({ champ: it.champ, libelle: it.champLibelle ?? it.champ, justificatif: it.libelle });
                }}
              >
                {(Object.keys(CHECKLIST_STATE_LABELS) as ChecklistState[]).map((s) => (
                  <option key={s} value={s}>
                    {CHECKLIST_STATE_LABELS[s]}
                  </option>
                ))}
              </Select>
              <Input
                aria-label={`Note : ${it.libelle}`}
                placeholder="Note"
                defaultValue={v.note ?? ''}
                onBlur={(e) => {
                  if ((v.note ?? '') !== e.target.value) save(it.id, v.etat, e.target.value);
                }}
              />
            </div>
          );
        })}
        {msg ? <p className="text-xs text-muted">{msg}</p> : null}
      </CardBody>
    </Card>
  );
}
