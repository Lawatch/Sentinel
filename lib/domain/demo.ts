import type { AssetType, PropertyInputs } from '@/lib/finance/schema';
import { propertyInputsSchema } from '@/lib/finance/schema';

/**
 * Jeu de démonstration : 10 biens synthétiques (annonces fictives, adresses de rues réelles).
 * Chargé uniquement par une commande explicite, marqué « DÉMO » partout, supprimable en un clic.
 */
const d = (valeur: number) => ({ valeur, statut: 'declare' as const, source: 'Donnée de démonstration' });
const dpe = (classe: string, date: string, energie = 'Gaz naturel') => ({
  classe: { valeur: classe, statut: 'declare' as const, source: 'Donnée de démonstration' },
  date: { valeur: date, statut: 'declare' as const },
  energie_chauffage: { valeur: energie, statut: 'declare' as const },
  numero: null,
});

interface DemoProperty {
  type_actif: AssetType;
  adresse: string;
  lat: number;
  lon: number;
  code_insee: string;
  commune: string;
  inputs: PropertyInputs;
}

const p = (x: Omit<DemoProperty, 'inputs'> & { inputs: Record<string, unknown> }): DemoProperty => ({ ...x, inputs: propertyInputsSchema.parse(x.inputs) });

export const DEMO_PROPERTIES: DemoProperty[] = [
  p({ type_actif: 'appartement', adresse: '24 rue de Bellevue, 92100 Boulogne-Billancourt', lat: 48.8336, lon: 2.2431, code_insee: '92012', commune: 'Boulogne-Billancourt',
    inputs: { prix: d(229000), surface: d(31), loyer: d(950), taxe_fonciere: d(780), charges_copro: d(1300), dpe: dpe('D', '2024-03-12'), pieces: d(1), epoque: { valeur: '1946_1970', statut: 'declare' } } }),
  p({ type_actif: 'appartement', adresse: '12 rue Danton, 93100 Montreuil', lat: 48.8599, lon: 2.4413, code_insee: '93048', commune: 'Montreuil',
    inputs: { prix: d(265000), surface: d(48), loyer: d(1150), taxe_fonciere: d(1100), charges_copro: d(1600), dpe: dpe('C', '2023-06-01'), pieces: d(2), epoque: { valeur: '1971_1990', statut: 'declare' } } }),
  p({ type_actif: 'appartement', adresse: '8 rue du Landy, 93200 Saint-Denis', lat: 48.9147, lon: 2.3584, code_insee: '93066', commune: 'Saint-Denis',
    inputs: { prix: d(168000), surface: d(42), loyer: d(890), taxe_fonciere: d(950), charges_copro: d(1800), dpe: dpe('E', '2022-11-20', 'Électricité'), pieces: d(2), epoque: { valeur: 'avant_1946', statut: 'declare' } } }),
  p({ type_actif: 'appartement', adresse: '41 rue de la Convention, 75015 Paris', lat: 48.8429, lon: 2.2853, code_insee: '75115', commune: 'Paris 15e',
    inputs: { prix: d(355000), surface: d(34), loyer: d(1250), taxe_fonciere: d(620), charges_copro: d(1900), dpe: dpe('F', '2023-09-15'), pieces: d(2), epoque: { valeur: 'avant_1946', statut: 'declare' } } }),
  p({ type_actif: 'appartement', adresse: '3 avenue Jean Jaurès, 94200 Ivry-sur-Seine', lat: 48.8155, lon: 2.3843, code_insee: '94041', commune: 'Ivry-sur-Seine',
    inputs: { prix: d(199000), surface: d(28), loyer: d(820), taxe_fonciere: d(700), dpe: dpe('G', '2024-01-08', 'Électricité') } }),
  p({ type_actif: 'maison', adresse: '15 rue Gambetta, 95100 Argenteuil', lat: 48.9465, lon: 2.2496, code_insee: '95018', commune: 'Argenteuil',
    inputs: { prix: d(312000), surface: d(95), loyer: d(1550), taxe_fonciere: d(1850), dpe: dpe('D', '2025-02-01') } }),
  p({ type_actif: 'immeuble', adresse: '27 rue de Paris, 77100 Meaux', lat: 48.9606, lon: 2.8787, code_insee: '77284', commune: 'Meaux',
    inputs: { prix: d(420000), surface: d(180), nb_lots: d(4), loyers_lots: [d(620), d(640), d(590), d(710)], taxe_fonciere: d(3200), travaux: d(25000), dpe: dpe('D', '2023-05-10') } }),
  p({ type_actif: 'appartement', adresse: '5 rue de la République, 78100 Saint-Germain-en-Laye', lat: 48.8977, lon: 2.0935, code_insee: '78551', commune: 'Saint-Germain-en-Laye',
    inputs: { prix: d(298000), surface: d(52) } }),
  p({ type_actif: 'murs_commerciaux', adresse: '18 rue Jean Jaurès, 92800 Puteaux', lat: 48.8846, lon: 2.2383, code_insee: '92062', commune: 'Puteaux',
    inputs: { prix: d(285000), surface: d(70), taxe_fonciere: d(2400),
      murs: { loue: true, loyer_annuel_ht: d(21600), loyer_marche_annuel_ht: d(20000), indice: 'ILC', prochaine_triennale: '2028-04-01', fin_bail: '2031-03-31', refacturation_tf: 'oui', refacturation_charges: 'oui', activite_locataire: 'Boulangerie', travaux_remise_en_etat: d(15000) } } }),
  p({ type_actif: 'fonds_commerce', adresse: '9 place de la Mairie, 91300 Massy', lat: 48.7309, lon: 2.2713, code_insee: '91377', commune: 'Massy',
    inputs: { prix: d(150000), surface: d(80),
      fonds: { stock_inclus: false, ca: [d(370000), d(385000), d(400000)], ebe: [d(62000), d(66000), d(70000)], remuneration_cedant: d(30000), remuneration_cible: d(45000), loyer_annuel: d(24000), stock: d(15000), investissements_initiaux: d(20000), investissements_maintien: d(5000), bfr: d(10000), honoraires: d(6000), apport: d(54810), pret_montant: d(150000), pret_taux: d(0.045), pret_duree_mois: d(84), taux_marge_cv: d(0.6), masse_salariale: d(98000), effectif: d(3), duree_restante_bail_mois: d(62) } } }),
];
