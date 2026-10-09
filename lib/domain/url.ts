/** Paramètres de suivi retirés avant comparaison d'URL. */
const TRACKING = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^gbraid$/i, /^wbraid$/i, /^msclkid$/i, /^mc_(cid|eid)$/i, /^xtor$/i, /^at_/i, /^ref(errer)?$/i, /^_ga$/i, /^igshid$/i, /^s_kwcid$/i, /^cmp$/i, /^origin$/i];

/**
 * URL normalisée (unique par utilisateur) : schéma et hôte en minuscules, « www. » retiré,
 * fragment et paramètres de suivi supprimés, paramètres restants triés, barre finale retirée.
 */
export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return s.toLowerCase();
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.some((re) => re.test(k)))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? '?' + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
  const path = u.pathname.replace(/\/+$/, '') || '';
  const port = u.port && u.port !== '443' && u.port !== '80' ? `:${u.port}` : '';
  return `https://${host}${port}${path}${query}`;
}

export const isValidUrl = (raw: string) => {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    return Boolean(u.hostname.includes('.'));
  } catch {
    return false;
  }
};
