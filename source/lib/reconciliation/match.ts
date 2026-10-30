import { normalizeId } from './values.ts';
import type { ComparisonSettings, Order, Purchase } from './records.ts';

export const bucketLabels = {
  matched: 'Matched', difference: 'Value difference', missing: 'Missing in GA4', excluded: 'Not expected in GA4',
  currency: 'Currency review', ambiguous: 'ID review required', duplicate: 'Duplicate transaction ID',
  extra: 'ID not found in Shopify', unidentified: 'Missing transaction ID', linked: 'Found in Shopify',
} as const;
export type Bucket = keyof typeof bucketLabels;
export type LedgerRow = {
  readonly side: 'Shopify' | 'GA4';
  readonly id: string;
  readonly bucket: Bucket;
  readonly day: string;
  readonly currency: string;
  readonly shopifyValue: number | '';
  readonly ga4Value: number | '';
  readonly delta: number | '';
  readonly key: string;
  readonly gateway: string;
  readonly source: string;
  readonly notes: string;
};

export function reconcile(orders: readonly Order[], purchases: readonly Purchase[], settings: ComparisonSettings): readonly LedgerRow[] {
  const candidates = new Map<string, Map<Order, string>>();
  for (const order of orders) for (const key of order.keys) {
    const id = normalizeId(key.value);
    if (!id) continue;
    const owners = candidates.get(id) || new Map<Order, string>();
    if (!owners.has(order)) owners.set(order, key.key);
    candidates.set(id, owners);
  }
  const grouped = new Map<string, Purchase[]>();
  for (const purchase of purchases) {
    const group = grouped.get(purchase.id) || [];
    group.push(purchase); grouped.set(purchase.id, group);
  }
  const linked = new Map<Order, { readonly purchase: Purchase; readonly key: string }[]>();
  const ambiguous = new Set<Order>();
  for (const purchase of purchases) {
    const owners = candidates.get(purchase.id);
    if (!owners) continue;
    if (owners.size > 1) { for (const order of owners.keys()) ambiguous.add(order); continue; }
    for (const [order, key] of owners) {
      const rows = linked.get(order) || [];
      rows.push({ purchase, key }); linked.set(order, rows);
    }
  }
  const result: LedgerRow[] = orders.map((order) => {
    const matches = linked.get(order) || [];
    const currencies = new Set(matches.map(({ purchase }) => purchase.currency));
    const comparable = Boolean(order.currency) && currencies.size === 1 && currencies.has(order.currency);
    const ga4Value = matches.reduce((sum, { purchase }) => sum + purchase.value, 0);
    const delta = ga4Value - order.value;
    const tolerance = Math.max(settings.absoluteTolerance, Math.abs(order.value) * settings.percentTolerance / 100);
    const bucket: Bucket = order.excluded ? 'excluded' : ambiguous.has(order) ? 'ambiguous' : !matches.length ? 'missing' : !comparable ? 'currency' : Math.abs(delta) - tolerance > 1e-9 ? 'difference' : 'matched';
    const duplicates = matches.some(({ purchase }) => (grouped.get(purchase.id) || []).reduce((sum, p) => sum + p.count, 0) > 1);
    return {
      side: 'Shopify', id: order.id, bucket, day: order.day, currency: order.currency,
      shopifyValue: order.value, ga4Value: matches.length && comparable ? ga4Value : '',
      delta: matches.length && comparable ? Math.round(delta * 100) / 100 : '',
      key: [...new Set(matches.map((match) => match.key))].join(' + '), gateway: order.gateway, source: order.source,
      notes: [order.excluded, ...order.notes, ...(duplicates ? ['Repeated/count>1 GA4 ID: values are summed; inspect dimension splits and duplicate collection.'] : []), ...(new Set(matches.map(({ purchase }) => purchase.id)).size > 1 ? ['Several GA4 IDs match this order. Review key conventions before interpreting the summed value.'] : []), ...(matches.some(({ purchase }) => purchase.day !== order.day) ? ['GA4 date differs from the Shopify property-zone day.'] : [])].filter(Boolean).join(' '),
    };
  });
  for (const purchase of purchases) {
    const owners = candidates.get(purchase.id);
    const duplicate = Boolean(purchase.id) && (grouped.get(purchase.id) || []).reduce((sum, row) => sum + row.count, 0) > 1;
    result.push({
      side: 'GA4', id: purchase.id, bucket: !purchase.id ? 'unidentified' : owners && owners.size > 1 ? 'ambiguous' : duplicate ? 'duplicate' : owners ? 'linked' : 'extra',
      day: purchase.day, currency: purchase.currency, shopifyValue: '', ga4Value: purchase.value, delta: '',
      key: owners?.size === 1 ? [...owners.values()][0] || '' : '', gateway: '', source: '',
      notes: `Data row ${purchase.row - 1}; purchase count ${purchase.count}.` + (!owners && purchase.id ? ' ID not found in Shopify.' : '') + (duplicate ? ' Repetition in this export is not proof of duplicate tagging.' : ''),
    });
  }
  return result;
}
