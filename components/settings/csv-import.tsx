'use client';

import Papa from 'papaparse';
import { useMemo, useState, useTransition } from 'react';
import { confirmImport, type ImportReport } from '@/app/actions/import';
import { IMPORT_COLUMNS, guessMapping, validateRows, type ColumnMapping, type ImportKey } from '@/lib/domain/csv-import';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { fmtEur } from '@/components/data/format';

/**
 * Import CSV : aperçu, association des colonnes, rapport d'erreurs ligne par ligne.
 * Aucune écriture tant que l'utilisateur n'a pas confirmé.
 */
export function CsvImport() {
  const [file, setFile] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const validation = useMemo(() => (rows.length ? validateRows(rows, mapping) : null), [rows, mapping]);

  const onFile = (f: File) => {
    setReport(null);
    setError(null);
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const h = res.meta.fields ?? [];
        if (!h.length) return setError('Fichier vide ou sans ligne d’en-tête.');
        setFile(f.name);
        setHeaders(h);
        setRows(res.data);
        setMapping(guessMapping(h));
      },
      error: (e) => setError(e.message),
    });
  };

  return (
    <Card>
      <CardHeader title="Importer des annonces (CSV)">
        <p className="text-xs text-muted">
          Colonnes : type, prix, surface, adresse, url (obligatoires), puis loyer, charges, taxe foncière, DPE, travaux, lots, description.{' '}
          <a className="text-accent underline" href="/exemple-import.csv" download>
            Fichier exemple
          </a>
          . Une URL déjà connue ajoute une observation de prix ; notes et statuts ne sont jamais modifiés.
        </p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Fichier CSV"
          data-testid="import-fichier"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {rows.length && !report ? (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">Association des colonnes ({file}, {rows.length} lignes)</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {IMPORT_COLUMNS.map((c) => (
                  <label key={c.key} className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">
                      {c.label}
                      {c.required ? ' *' : ''}
                    </span>
                    <Select value={mapping[c.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [c.key as ImportKey]: e.target.value || undefined })}>
                      <option value="">— non importé —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
            </div>
            {validation?.missingColumns.length ? (
              <p className="text-sm text-danger">Associez les colonnes obligatoires : {validation.missingColumns.join(', ')}.</p>
            ) : validation ? (
              <>
                <p className="text-sm" data-testid="import-apercu">
                  <strong>{validation.valid.length}</strong> ligne(s) prête(s) à importer, <strong className={validation.errors.length ? 'text-danger' : ''}>{validation.errors.length}</strong> ligne(s) en
                  erreur. Rien n’a encore été écrit.
                </p>
                {validation.errors.length ? (
                  <ul className="max-h-48 overflow-auto rounded-md border border-danger/30 bg-danger/5 p-2 text-xs">
                    {validation.errors.map((e) => (
                      <li key={e.ligne}>
                        Ligne {e.ligne} : {e.messages.join(' ; ')}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th className="py-1 pr-2">Ligne</th>
                        <th className="py-1 pr-2">Type</th>
                        <th className="py-1 pr-2">Adresse</th>
                        <th className="py-1 pr-2 text-right">Prix</th>
                        <th className="py-1 pr-2 text-right">Surface</th>
                        <th className="py-1 text-right">Loyer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.valid.slice(0, 10).map((r) => (
                        <tr key={r.ligne} className="border-b border-border">
                          <td className="py-1 pr-2">{r.ligne}</td>
                          <td className="py-1 pr-2">{r.type_actif}</td>
                          <td className="py-1 pr-2">{r.adresse}</td>
                          <td className="py-1 pr-2 text-right">{fmtEur(r.prix)}</td>
                          <td className="py-1 pr-2 text-right">{r.surface} m²</td>
                          <td className="py-1 text-right">{r.loyer === null ? '—' : fmtEur(r.loyer)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validation.valid.length > 10 ? <p className="mt-1 text-xs text-muted">… et {validation.valid.length - 10} autre(s).</p> : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    data-testid="import-confirmer"
                    disabled={pending || validation.valid.length === 0}
                    onClick={() =>
                      start(async () => {
                        const r = await confirmImport(file ?? 'import.csv', rows, mapping);
                        if (r.ok) setReport(r.data);
                        else setError(r.error);
                      })
                    }
                  >
                    {pending ? 'Import…' : `Confirmer l’import de ${validation.valid.length} ligne(s)`}
                  </Button>
                  <Button
                    onClick={() => {
                      setRows([]);
                      setFile(null);
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
        {report ? (
          <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm" data-testid="import-rapport">
            <p>
              Import terminé : <strong>{report.crees}</strong> bien(s) créé(s), <strong>{report.observations}</strong> observation(s) de prix ajoutée(s), {report.inchanges} inchangé(s),{' '}
              <strong>{report.rejetees.length}</strong> ligne(s) rejetée(s).
            </p>
            {report.rejetees.length ? (
              <ul className="mt-2 text-xs text-danger">
                {report.rejetees.map((e) => (
                  <li key={e.ligne}>
                    Ligne {e.ligne} : {e.messages.join(' ; ')}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-muted">Les biens importés seront enrichis à leur première ouverture.</p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
