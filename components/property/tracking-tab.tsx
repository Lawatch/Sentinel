'use client';

import { useState, useTransition } from 'react';
import { TrendingDown } from 'lucide-react';
import { addPriceObservation, deleteProperty, updateTracking } from '@/app/actions/properties';
import { priceHistory, type PriceObservation } from '@/lib/domain/price-history';
import { TRACKING_LABELS, TRACKING_STATUSES, type TrackingStatus } from '@/lib/domain/statuses';
import type { Snapshot } from '@/lib/domain/property';
import { VERDICT_LABELS } from '@/lib/finance/types';
import { parseNumber } from '@/lib/domain/csv-import';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { fmtDateTime, fmtEur, fmtPct } from '@/components/data/format';
import { useRouter } from 'next/navigation';

export function TrackingTab({
  propertyId,
  statut,
  motif,
  notes,
  observations,
  snapshots,
  url,
}: {
  propertyId: string;
  statut: TrackingStatus;
  motif: string | null;
  notes: string;
  observations: PriceObservation[];
  snapshots: Snapshot[];
  url: string;
}) {
  const router = useRouter();
  const [s, setS] = useState(statut);
  const [m, setM] = useState(motif ?? '');
  const [n, setN] = useState(notes);
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const h = priceHistory(observations);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Suivi de décision" />
        <CardBody className="flex flex-col gap-3">
          <Field label="Statut" htmlFor="statut">
            <Select id="statut" value={s} onChange={(e) => setS(e.target.value as TrackingStatus)} data-testid="statut-suivi">
              {TRACKING_STATUSES.map((t) => (
                <option key={t} value={t}>
                  {TRACKING_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          {s === 'rejete' ? (
            <Field label="Motif de rejet *" htmlFor="motif">
              <Input id="motif" value={m} onChange={(e) => setM(e.target.value)} placeholder="Ex. : copropriété en difficulté" />
            </Field>
          ) : null}
          {s === 'offre_faite' && statut !== 'offre_faite' ? (
            <p className="text-xs text-muted">Une copie figée de l’analyse (entrées, paramètres, résultats, version du moteur) sera enregistrée.</p>
          ) : null}
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" rows={6} value={n} onChange={(e) => setN(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await updateTracking(propertyId, { statut: s, motif_rejet: m || null, notes: n });
                  setMsg(r.ok ? 'Suivi enregistré.' : r.error);
                })
              }
            >
              Enregistrer le suivi
            </Button>
            <a href={url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
              Ouvrir l’annonce
            </a>
          </div>
          {msg ? <p className="text-sm text-muted">{msg}</p> : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Historique des prix" />
        <CardBody className="flex flex-col gap-3 text-sm">
          {h.baisse ? (
            <p className="flex items-center gap-1 font-medium text-success" data-testid="baisse-prix">
              <TrendingDown className="h-4 w-4" /> Baisse de {fmtPct(-h.variation!, 1)} ({fmtEur(h.precedent)} → {fmtEur(h.actuel)})
            </p>
          ) : null}
          <table className="w-full text-sm">
            <tbody>
              {[...h.observations].reverse().map((o, i) => (
                <tr key={o.id ?? i} className="border-b border-border last:border-0">
                  <td className="py-1">{fmtDateTime(o.date)}</td>
                  <td className="py-1 text-right font-medium">{fmtEur(o.prix)}</td>
                  <td className="py-1 pl-2 text-right text-xs text-muted">{o.origine}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const p = parseNumber(price);
              if (!p || Number.isNaN(p)) return setMsg('Prix invalide.');
              start(async () => {
                const r = await addPriceObservation(propertyId, p);
                setMsg(r.ok ? 'Nouvelle observation enregistrée.' : r.error);
                if (r.ok) setPrice('');
              });
            }}
          >
            <Input inputMode="decimal" placeholder="Nouveau prix observé (€)" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Button type="submit" disabled={pending}>
              Ajouter
            </Button>
          </form>
        </CardBody>
      </Card>
      {snapshots.length ? (
        <Card className="lg:col-span-2">
          <CardHeader title="Analyses figées à l’offre" />
          <CardBody className="flex flex-col gap-2 text-sm">
            {snapshots.map((snap, i) => {
              const a = snap.resultats;
              const verdict = a.kind === 'hors_perimetre' ? '—' : VERDICT_LABELS[a.verdict.verdict];
              const cf = a.kind === 'residentiel' || a.kind === 'murs' ? a.header.cash_flow_prudent : null;
              const pm = a.kind === 'residentiel' || a.kind === 'murs' ? a.header.prix_max : a.kind === 'fonds' ? a.offre.indicateur : null;
              return (
                <details key={i} className="rounded-md border border-border p-2">
                  <summary className="cursor-pointer">
                    {fmtDateTime(snap.date)} · {verdict} · prix demandé {fmtEur(snap.inputs.prix.valeur)}
                    {cf?.ok ? ` · cash-flow prudent ${fmtEur(cf.valeur)}/mois` : ''}
                    {pm?.ok ? ` · prix max ${fmtEur(pm.valeur)}` : ''} · moteur v{snap.version_moteur} · profil « {snap.profil.nom} »
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-2 p-2 text-[11px]">{JSON.stringify({ entrees: snap.inputs, parametres: snap.profil.params, marche: snap.marche }, null, 1)}</pre>
                </details>
              );
            })}
          </CardBody>
        </Card>
      ) : null}
      <div className="lg:col-span-2">
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            if (!confirm('Supprimer définitivement ce bien, son historique et ses notes ?')) return;
            start(async () => {
              const r = await deleteProperty(propertyId);
              if (r.ok) router.push('/');
              else setMsg(r.error);
            });
          }}
        >
          Supprimer le bien
        </Button>
      </div>
    </div>
  );
}
