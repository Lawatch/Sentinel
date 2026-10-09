'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { fmtDateTime } from '@/components/data/format';

export interface SourceStatusRow {
  id: string;
  nom: string;
  usage: string;
  dernier_succes: string | null;
  derniere_erreur: { date: string; message: string | null } | null;
  test: { statut: 'ok' | 'erreur'; date: string; ms?: number; message?: string | null } | null;
}

/** État des sources publiques : opérationnelle (date du dernier appel réussi), en erreur, ou jamais interrogée. */
export function SourcesPanel({ rows }: { rows: SourceStatusRow[] }) {
  const [state, setState] = useState(rows);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/sources', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.status);
      setState(state.map((s) => ({ ...s, test: json.resultats.find((r: { id: string }) => r.id === s.id) ?? s.test })));
      setMsg('Test terminé.');
    } catch (e) {
      setMsg(`Test impossible : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="État des sources publiques"
        action={
          <Button size="sm" onClick={test} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Tester maintenant
          </Button>
        }
      >
        <p className="text-xs text-muted">Aucune source ne demande de clé. Une source en erreur s’affiche « indisponible », jamais « 0 résultat ».</p>
      </CardHeader>
      <CardBody className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">État</th>
              <th className="px-4 py-2">Dernier appel réussi</th>
              <th className="px-4 py-2">Dernière erreur</th>
            </tr>
          </thead>
          <tbody>
            {state.map((s) => {
              const ok = s.test ? s.test.statut === 'ok' : !!s.dernier_succes && (!s.derniere_erreur || s.derniere_erreur.date < s.dernier_succes);
              const never = !s.test && !s.dernier_succes && !s.derniere_erreur;
              return (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium">{s.nom}</p>
                    <p className="text-xs text-muted">{s.usage}</p>
                  </td>
                  <td className="px-4 py-2">
                    {never ? <Badge>jamais interrogée</Badge> : ok ? <Badge tone="success">opérationnelle</Badge> : <Badge tone="danger">en erreur</Badge>}
                    {s.test?.ms !== undefined ? <span className="ml-1 text-xs text-muted">{s.test.ms} ms</span> : null}
                  </td>
                  <td className="px-4 py-2 text-xs">{fmtDateTime(s.test?.statut === 'ok' ? s.test.date : s.dernier_succes)}</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {s.test?.statut === 'erreur' ? `${fmtDateTime(s.test.date)} — ${s.test.message}` : s.derniere_erreur ? `${fmtDateTime(s.derniere_erreur.date)} — ${s.derniere_erreur.message ?? ''}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {msg ? <p className="px-4 py-2 text-xs text-muted">{msg}</p> : null}
      </CardBody>
    </Card>
  );
}
