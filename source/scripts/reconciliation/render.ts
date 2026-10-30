import { bucketLabels, type LedgerRow } from '../../lib/reconciliation/match.ts';
import { csvDownload } from '../../lib/reconciliation/csv.ts';

export function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function resultCsv(rows: readonly LedgerRow[]): string {
  return csvDownload([
    ['Export', 'ID', 'Result', 'Day', 'Currency', 'Shopify value', 'GA4 value', 'Difference', 'Matched key', 'Payment method', 'Source', 'Notes'],
    ...rows.map((row) => [row.side, row.id, bucketLabels[row.bucket], row.day, row.currency, row.shopifyValue, row.ga4Value, row.delta, row.key, row.gateway, row.source, row.notes]),
  ]);
}

function table(title: string, headers: readonly string[], rows: readonly (readonly (string | number)[])[]): HTMLElement {
  const region = document.createElement('div');
  region.className = 'rc-table'; region.tabIndex = 0;
  region.setAttribute('role', 'region'); region.setAttribute('aria-label', title + ' (scroll horizontally)');
  const table = document.createElement('table');
  if (headers.includes('Notes')) table.className = 'rc-ledger';
  const caption = table.createCaption(); caption.textContent = title;
  const head = table.createTHead().insertRow();
  const numeric = new Set(['Shopify', 'GA4', 'Difference', 'Revenue', 'Orders', 'Matched', 'Value difference', 'Missing', 'Not expected', 'Review']);
  for (const label of headers) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; if (numeric.has(label)) th.className = 'rc-number'; head.append(th); }
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const [index, value] of row.entries()) { const td = tr.insertCell(); if (numeric.has(headers[index])) td.className = 'rc-number'; td.textContent = typeof value === 'number' ? String(Math.round(value * 100) / 100) : value || 'Unavailable'; }
  }
  region.append(table); return region;
}

export function renderResults(root: HTMLElement, rows: readonly LedgerRow[]): void {
  root.replaceChildren();
  const orders = rows.filter((row) => row.side === 'Shopify');
  const tally = document.createElement('dl'); tally.className = 'rc-tally';
  for (const key of ['matched', 'difference', 'missing', 'excluded', 'currency', 'ambiguous'] as const) {
    const item = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd');
    label.textContent = bucketLabels[key]; value.textContent = String(orders.filter((row) => row.bucket === key).length);
    item.append(label, value); tally.append(item);
  }
  root.append(tally);
  root.append(table('Shopify order ledger', ['Order', 'Result', 'Day', 'Currency', 'Shopify', 'GA4', 'Difference', 'Matched key', 'Payment method', 'Source', 'Notes'], orders.map((row) => [row.id, bucketLabels[row.bucket], row.day, row.currency, row.shopifyValue, row.ga4Value, row.delta, row.key, row.gateway, row.source, row.notes])));
  const ga4 = rows.filter((row) => row.side === 'GA4');
  root.append(table('GA4 row ledger', ['Transaction ID', 'Result', 'Day', 'Currency', 'Revenue', 'Matched key', 'Notes'], ga4.map((row) => [row.id, bucketLabels[row.bucket], row.day, row.currency, row.ga4Value, row.key, row.notes])));
  for (const [title, key] of [['By day (GA4 property time zone)', 'day'], ['By payment method', 'gateway'], ['By order source', 'source']] as const) {
    const groups = new Map<string, LedgerRow[]>();
    for (const row of orders) { const group = groups.get(row[key]) || []; group.push(row); groups.set(row[key], group); }
    root.append(table(title, ['Group', 'Orders', 'Matched', 'Value difference', 'Missing', 'Not expected', 'Review'], [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => [name, group.length, ...(['matched', 'difference', 'missing', 'excluded'] as const).map((bucket) => group.filter((row) => row.bucket === bucket).length), group.filter((row) => row.bucket === 'currency' || row.bucket === 'ambiguous').length])));
  }
}
