/**
 * Recherche par dichotomie de x tel que f(x) = cible, pour f monotone sur [lo, hi].
 * Retourne null si la cible n'est pas encadrée par f(lo) et f(hi).
 */
export function bisect(
  f: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  { tolerance = 1e-6, maxIter = 200 }: { tolerance?: number; maxIter?: number } = {},
): number | null {
  let flo = f(lo) - target;
  const fhi = f(hi) - target;
  if (Number.isNaN(flo) || Number.isNaN(fhi)) return null;
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  for (let k = 0; k < maxIter; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid) - target;
    if (fm === 0 || (hi - lo) / 2 < tolerance) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Plus grande valeur x ≥ 0 telle que f(x) ≥ cible, pour f décroissante.
 * Étend la borne haute par doublement à partir de `start`. Null si f(0) < cible.
 */
export function maxSatisfying(f: (x: number) => number, target: number, start: number, cap = 1e9): number | null {
  if (f(0) < target) return null;
  let hi = Math.max(start, 1);
  while (f(hi) >= target) {
    hi *= 2;
    if (hi > cap) return cap;
  }
  return bisect(f, target, 0, hi, { tolerance: 1e-7 });
}
