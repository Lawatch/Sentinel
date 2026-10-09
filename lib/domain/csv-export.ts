import Papa from 'papaparse';
import type { Analysis } from '@/lib/finance/analyze';
import { ASSET_TYPE_LABELS, type PropertyInputs } from '@/lib/finance/schema';
import { FIELD_STATUS_LABELS, VERDICT_LABELS, type Indicator } from '@/lib/finance/types';
import { TRACKING_LABELS } from './statuses';
import type { PropertyRow } from './property';

const val = (i: Indicator | undefined) => (i && i.ok ? Number(i.valeur.toFixed(4)) : '');

/** Export CSV des biens avec leurs indicateurs et la source de chaque valeur. */
export function exportCsv(rows: { p: PropertyRow; a: Analysis; profil: string }[]): string {
  const fields: (keyof PropertyInputs)[] = ['prix', 'surface', 'loyer', 'charges_copro', 'charges_copro_non_recup', 'taxe_fonciere', 'travaux', 'nb_lots', 'pieces'];
  const data = rows.map(({ p, a, profil }) => {
    const out: Record<string, string | number> = {
      id: p.id,
      titre: p.titre,
      type: ASSET_TYPE_LABELS[p.type_actif],
      adresse: p.adresse,
      commune: p.commune ?? '',
      code_insee: p.code_insee ?? '',
      url: p.url,
      statut_suivi: TRACKING_LABELS[p.statut],
      motif_rejet: p.motif_rejet ?? '',
      profil,
      demo: p.demo ? 'oui' : 'non',
    };
    for (const f of fields) {
      const field = p.inputs[f] as { valeur: number | null; statut: keyof typeof FIELD_STATUS_LABELS; source?: string | null };
      out[f] = field.valeur ?? '';
      out[`${f}_statut`] = FIELD_STATUS_LABELS[field.statut];
      out[`${f}_source`] = field.source ?? '';
    }
    out.dpe = p.inputs.dpe.classe.valeur ?? '';
    out.dpe_statut = FIELD_STATUS_LABELS[p.inputs.dpe.classe.statut];
    out.dpe_source = p.inputs.dpe.classe.source ?? '';
    if (a.kind === 'residentiel' || a.kind === 'murs') {
      out.verdict = VERDICT_LABELS[a.verdict.verdict];
      out.confiance = a.confiance.niveau;
      out.cash_flow_prudent_mensuel = val(a.header.cash_flow_prudent);
      out.cash_flow_central_mensuel = val(a.scenarios.central.indicateurs.cf_apres_credit);
      out.prix_offre_max = val(a.header.prix_max);
      out.ecart_prix_offre = a.offre.resultat?.atteignable ? Number(a.offre.resultat.ecart.toFixed(4)) : '';
      out.ecart_mediane_dvf = val(a.ecart_dvf);
      out.rendement_brut_central = val(a.scenarios.central.indicateurs.rendement_brut);
      out.rendement_net_central = val(a.scenarios.central.indicateurs.rendement_net);
      out.loyer_marche_source = a.entrees.loyer_marche?.source ?? '';
      out.alertes = a.alertes.map((x) => `[${x.niveau}] ${x.message}`).join(' | ');
    } else if (a.kind === 'fonds') {
      out.verdict = VERDICT_LABELS[a.verdict.verdict];
      out.confiance = a.confiance.niveau;
      out.couverture_dette = val(a.indicateurs.couverture);
      out.tresorerie_apres_dette_annuelle = val(a.indicateurs.tresorerie);
      out.prix_sur_ebe_retraite = val(a.indicateurs.prix_sur_ebe);
      out.prix_offre_max = val(a.offre.indicateur);
      out.alertes = a.alertes.map((x) => `[${x.niveau}] ${x.message}`).join(' | ');
    } else {
      out.verdict = 'Hors périmètre';
    }
    return out;
  });
  const columns = [...new Set(data.flatMap((d) => Object.keys(d)))];
  // Point-virgule et BOM UTF-8 : ouverture directe dans un tableur en français.
  return '﻿' + Papa.unparse({ fields: columns, data: data.map((d) => columns.map((c) => d[c] ?? '')) }, { delimiter: ';' });
}
