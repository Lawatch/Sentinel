export const TRACKING_STATUSES = ['a_analyser', 'a_visiter', 'offre_faite', 'rejete', 'acquis', 'archive'] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export const TRACKING_LABELS: Record<TrackingStatus, string> = {
  a_analyser: 'À analyser',
  a_visiter: 'À visiter',
  offre_faite: 'Offre faite',
  rejete: 'Rejeté',
  acquis: 'Acquis',
  archive: 'Archivé',
};
