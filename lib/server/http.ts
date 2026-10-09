/**
 * Appels sortants vers les sources publiques : délai d'attente de 8 s et limite de débit par hôte
 * (au plus 4 requêtes simultanées, espacées d'au moins 120 ms). Toujours côté serveur.
 */
export const SOURCE_TIMEOUT_MS = 8000;
const MAX_CONCURRENT = 4;
const MIN_SPACING_MS = 120;

interface HostState {
  active: number;
  last: number;
  queue: (() => void)[];
}
const hosts = new Map<string, HostState>();

async function acquire(host: string) {
  const s = hosts.get(host) ?? { active: 0, last: 0, queue: [] };
  hosts.set(host, s);
  if (s.active >= MAX_CONCURRENT) await new Promise<void>((resolve) => s.queue.push(resolve));
  s.active++;
  const wait = s.last + MIN_SPACING_MS - Date.now();
  s.last = Math.max(Date.now(), s.last + MIN_SPACING_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return () => {
    s.active--;
    s.queue.shift()?.();
  };
}

export class SourceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export async function fetchSource(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const host = new URL(url).host;
  const release = await acquire(host);
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(init.timeoutMs ?? SOURCE_TIMEOUT_MS),
      headers: { 'user-agent': 'Sentinel/1.0 (outil personnel d analyse immobiliere)', ...(init.headers ?? {}) },
      cache: 'no-store',
    });
    return res;
  } catch (e) {
    const err = e as Error;
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new SourceError(`délai de ${(init.timeoutMs ?? SOURCE_TIMEOUT_MS) / 1000} s dépassé`);
    throw new SourceError(`réseau : ${err.message}`);
  } finally {
    release();
  }
}

/** JSON d'une source ; une réponse vide (certains points d'accès Géorisques) vaut « aucune donnée » (null). */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const res = await fetchSource(url, init);
  if (!res.ok) throw new SourceError(`HTTP ${res.status}`, res.status);
  const text = await res.text();
  if (!text.trim()) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError('réponse illisible (JSON attendu)');
  }
}

export async function fetchBuffer(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<ArrayBuffer> {
  const res = await fetchSource(url, init);
  if (!res.ok) throw new SourceError(`HTTP ${res.status}`, res.status);
  return res.arrayBuffer();
}

export interface Http {
  json: typeof fetchJson;
  buffer: typeof fetchBuffer;
}
export const http: Http = { json: fetchJson, buffer: fetchBuffer };
