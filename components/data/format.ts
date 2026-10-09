const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export const fmtEur = (v: number | null | undefined, precise = false) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (precise ? eur2 : eur0).format(v));
export const fmtNum = (v: number | null | undefined, digits: 0 | 1 | 2 = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : (digits === 0 ? num0 : digits === 1 ? num1 : num2).format(v);
/** Ratio (0,06) → « 6,00 % ». */
export const fmtPct = (v: number | null | undefined, digits = 2, signed = false) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : `${signed && v > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v * 100)} %`;
export const fmtDate = (v: string | null | undefined) => (v ? new Date(v.length === 10 ? v + 'T12:00:00Z' : v).toLocaleDateString('fr-FR') : '—');
export const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function fmtUnit(v: number | string | null, unite?: string) {
  if (v === null) return '—';
  if (typeof v === 'string') return v;
  switch (unite) {
    case '€':
      return fmtEur(v, Math.abs(v) < 10000 && !Number.isInteger(v));
    case '€/mois':
      return `${fmtEur(v, true)} / mois`;
    case '€/an':
      return `${fmtEur(v)} / an`;
    case '%':
      return `${fmtNum(v, 2)} %`;
    case '€/m²':
      return `${fmtNum(v, 0)} €/m²`;
    case 'm²':
      return `${fmtNum(v, 1)} m²`;
    case 'mois':
      return `${fmtNum(v)} mois`;
    default:
      return fmtNum(v, 2);
  }
}
