import type { AssetType } from '@/lib/finance/schema';

export type ChecklistState = 'a_faire' | 'ok' | 'probleme';
export const CHECKLIST_STATE_LABELS: Record<ChecklistState, string> = { a_faire: 'À faire', ok: 'OK', probleme: 'Problème' };

export interface ChecklistItem {
  id: string;
  libelle: string;
  /** Champ d'entrée que ce justificatif permet de passer au statut « vérifié ». */
  champ?: string;
  champLibelle?: string;
}

const RESIDENTIEL: ChecklistItem[] = [
  { id: 'dpe', libelle: 'DPE et sa date', champ: 'dpe.classe', champLibelle: 'DPE' },
  { id: 'pv_ag', libelle: 'Trois derniers PV d’assemblée générale et travaux votés', champ: 'travaux', champLibelle: 'travaux' },
  { id: 'charges', libelle: 'Relevé annuel de charges', champ: 'charges_copro', champLibelle: 'charges de copropriété' },
  { id: 'taxe_fonciere', libelle: 'Avis de taxe foncière', champ: 'taxe_fonciere', champLibelle: 'taxe foncière' },
  { id: 'diagnostics', libelle: 'Diagnostics (amiante, plomb, électricité, gaz, ERP)' },
  { id: 'bail', libelle: 'Bail et quittances si loué', champ: 'loyer', champLibelle: 'loyer' },
  { id: 'reglement', libelle: 'Règlement de copropriété (usage, meublé)' },
  { id: 'urbanisme', libelle: 'Règles d’urbanisme si travaux ou division' },
];

const MURS: ChecklistItem[] = [
  { id: 'bail_complet', libelle: 'Bail complet et avenants', champ: 'murs.loyer_annuel_ht', champLibelle: 'loyer contractuel' },
  { id: 'charges_refact', libelle: 'Relevés de charges refacturées', champ: 'murs.charges_annuelles', champLibelle: 'charges' },
  { id: 'taxe_fonciere', libelle: 'Avis de taxe foncière', champ: 'taxe_fonciere', champLibelle: 'taxe foncière' },
  { id: 'sante_locataire', libelle: 'Santé financière du locataire' },
  { id: 'etat_lieux', libelle: 'État des lieux' },
  { id: 'gros_travaux', libelle: 'Gros travaux à la charge du bailleur', champ: 'travaux', champLibelle: 'travaux' },
];

const FONDS: ChecklistItem[] = [
  { id: 'liasses', libelle: 'Trois dernières liasses fiscales', champ: 'fonds.ca', champLibelle: 'CA et EBE' },
  { id: 'ca_mensuel', libelle: 'CA mensuel' },
  { id: 'bail', libelle: 'Bail et conditions de cession du bail', champ: 'fonds.loyer_annuel', champLibelle: 'loyer' },
  { id: 'personnel', libelle: 'Registre du personnel et contrats', champ: 'fonds.masse_salariale', champLibelle: 'masse salariale' },
  { id: 'bodacc', libelle: 'Absence de procédure collective (BODACC)' },
  { id: 'licences', libelle: 'Licences et autorisations' },
  { id: 'inventaire', libelle: 'Inventaire du matériel' },
];

export function checklistFor(type: AssetType): ChecklistItem[] {
  if (type === 'murs_commerciaux') return MURS;
  if (type === 'fonds_commerce') return FONDS;
  if (type === 'titres_societe' || type === 'murs_et_fonds') return [];
  return RESIDENTIEL;
}

export type ChecklistValue = Record<string, { etat: ChecklistState; note?: string }>;
