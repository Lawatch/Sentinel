'use client';

import { useState, useTransition } from 'react';
import { Download, Upload } from 'lucide-react';
import { restoreBackup } from '@/app/actions/backup';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

export function BackupPanel() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader title="Export, sauvegarde et restauration">
        <p className="text-xs text-muted">
          Faites une sauvegarde régulière : un projet Supabase gratuit inactif peut être mis en pause (voir le README). La restauration est idempotente : rejouer deux fois le même fichier ne crée pas de doublons.
        </p>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="/api/export/csv">
              <Download className="h-4 w-4" /> Export CSV des biens
            </a>
          </Button>
          <Button asChild variant="primary">
            <a href="/api/sauvegarde">
              <Download className="h-4 w-4" /> Sauvegarde JSON complète
            </a>
          </Button>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1 font-medium">
            <Upload className="h-4 w-4" /> Restaurer une sauvegarde JSON
          </span>
          <input
            type="file"
            accept="application/json,.json"
            disabled={pending}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!confirm(`Restaurer « ${f.name} » ? Les lignes du fichier remplaceront celles de même identifiant.`)) return;
              f.text().then((text) =>
                start(async () => {
                  const r = await restoreBackup(text);
                  setMsg(r.ok ? `Restauration terminée : ${r.data.profils} profil(s), ${r.data.zones} zone(s), ${r.data.biens} bien(s), ${r.data.observations} observation(s) de prix.` : r.error);
                }),
              );
            }}
          />
        </label>
        {msg ? <p className="text-sm text-muted">{msg}</p> : null}
      </CardBody>
    </Card>
  );
}
