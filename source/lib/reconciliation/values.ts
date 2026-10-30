import { CsvError } from './csv.ts';

export function amount(text: string): number {
  if (!/^-?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(text)) throw new CsvError('A revenue or count cell is not a plain number. Use decimal points and no currency symbols.');
  const plain = text.replaceAll(',', '');
  const value = Number(plain);
  if (!Number.isFinite(value)) throw new CsvError('A numeric cell is outside the supported range.');
  return value;
}

export function normalizeId(text: string): string {
  const id = text.trim().replace(/^gid:\/\/shopify\/Order\//, '').replace(/^#/, '').replace(/\s/g, '');
  if (/^\d+$/.test(id)) return id.replace(/^0+(?=\d)/, '');
  return id;
}

export function currencyCode(text: string): string {
  if (!text) return '';
  if (!/^[A-Za-z]{3}$/.test(text)) throw new CsvError('Currency must be a three-letter code such as USD.');
  return text.toUpperCase();
}

export function propertyDay(text: string, timeZone: string): string {
  const compact = text.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  if (/^\d{4}-\d{2}-\d{2}$/.test(compact)) {
    const date = new Date(compact + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== compact) throw new CsvError('A date cell is not a valid calendar date.');
    return compact;
  }
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) throw new CsvError('Timestamp cells need a UTC offset. Use YYYY-MM-DD for GA4 calendar dates.');
  const calendar = text.slice(0, 10);
  const calendarDate = new Date(calendar + 'T12:00:00Z');
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== calendar) throw new CsvError('A timestamp has an invalid calendar date.');
  const iso = text.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new CsvError('A timestamp cell is invalid.');
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
