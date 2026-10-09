'use client';

import { useState, useTransition } from 'react';
import { deleteDemo, loadDemo } from '@/app/actions/demo';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoBadge } from '@/components/ui/badge';

export function DemoPanel({ count }: { count: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader title="Données de démonstration">
        <p className="text-xs text-muted">
          10 biens synthétiques (annonces fictives), marqués <DemoBadge /> partout, supprimables en un clic. {count ? `${count} bien(s) de démonstration présent(s).` : ''}
        </p>
      </CardHeader>
      <CardBody className="flex flex-wrap items-center gap-2">
        <Button
          disabled={pending}
          data-testid="demo-charger"
          onClick={() =>
            start(async () => {
              const r = await loadDemo();
              setMsg(r.ok ? `${r.data.n} bien(s) de démonstration chargé(s).` : r.error);
            })
          }
        >
          Charger la démonstration
        </Button>
        <Button
          variant="ghost"
          className="text-danger"
          disabled={pending || count === 0}
          onClick={() =>
            start(async () => {
              const r = await deleteDemo();
              setMsg(r.ok ? `${r.data.n} bien(s) de démonstration supprimé(s).` : r.error);
            })
          }
        >
          Supprimer la démonstration
        </Button>
        {msg ? <span className="text-sm text-muted">{msg}</span> : null}
      </CardBody>
    </Card>
  );
}
