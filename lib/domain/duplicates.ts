/** Adresse comparable : minuscules, sans accents ni ponctuation, espaces réduits. */
export function normalizeAddress(a: string): string {
  return a
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(bis|ter)\b/g, ' $1 ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(avenue)\b/g, 'av')
    .replace(/\b(boulevard)\b/g, 'bd')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DuplicateCandidate {
  id: string;
  adresse: string;
  ban_id?: string | null;
  surface: number | null;
  titre?: string;
}

/**
 * Doublon possible : même adresse (ou même identifiant BAN) et surface à 5 % près.
 * Jamais de fusion automatique : l'utilisateur décide.
 */
export function possibleDuplicates(
  target: { adresse: string; ban_id?: string | null; surface: number | null },
  existing: DuplicateCandidate[],
  tolerance = 0.05,
): DuplicateCandidate[] {
  const addr = normalizeAddress(target.adresse);
  return existing.filter((e) => {
    const sameAddress =
      (target.ban_id && e.ban_id && target.ban_id === e.ban_id) || (addr.length > 0 && normalizeAddress(e.adresse) === addr);
    if (!sameAddress) return false;
    if (target.surface === null || e.surface === null) return false;
    const ref = Math.max(target.surface, e.surface);
    return Math.abs(target.surface - e.surface) / ref <= tolerance;
  });
}
