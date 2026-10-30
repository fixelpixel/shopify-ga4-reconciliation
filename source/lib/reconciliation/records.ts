import { CsvError, type CsvTable } from './csv.ts';
import { cell, findHeader, type ColumnMap } from './columns.ts';
import { amount, currencyCode, normalizeId, propertyDay } from './values.ts';

export type CandidateKey = { readonly key: string; readonly value: string };
export type Order = {
  readonly id: string;
  readonly keys: readonly CandidateKey[];
  readonly day: string;
  readonly value: number;
  readonly currency: string;
  readonly gateway: string;
  readonly source: string;
  readonly excluded: string;
  readonly notes: readonly string[];
};
export type Purchase = {
  readonly row: number;
  readonly id: string;
  readonly day: string;
  readonly value: number;
  readonly currency: string;
  readonly count: number;
};
export type ExportInput = { readonly table: CsvTable; readonly columns: ColumnMap };
export type ComparisonSettings = {
  readonly timeZone: string;
  readonly reportingCurrency: string;
  readonly localCurrency: boolean;
  readonly netRefunds: boolean;
  readonly absoluteTolerance: number;
  readonly percentTolerance: number;
};

export function shopifyOrders(input: ExportInput, settings: ComparisonSettings): readonly Order[] {
  const { table, columns } = input;
  const get = (row: readonly string[], names: readonly string[]) => cell(table, row, findHeader(table, names));
  const groups = new Map<string, readonly string[]>();
  let previous = '';
  for (const row of table.rows) {
    const id = cell(table, row, columns.id) || get(row, ['Name', 'Id']);
    if (!id) {
      if (previous && get(row, ['Lineitem name', 'Lineitem quantity'])) continue;
      throw new CsvError('A Shopify row has no order ID. Choose the correct ID column.');
    }
    previous = id;
    if (groups.has(id)) {
      const first = groups.get(id);
      if (first && cell(table, row, columns.revenue) && cell(table, row, columns.revenue) !== cell(table, first, columns.revenue)) throw new CsvError('Repeated Shopify IDs have different totals. Use the Admin orders export.');
      continue;
    }
    groups.set(id, row);
  }
  return [...groups].map(([id, row]) => {
    const value = amount(cell(table, row, columns.revenue));
    const total = get(row, ['Total']) ? amount(get(row, ['Total'])) : value;
    const refund = get(row, ['Refunded Amount']) ? amount(get(row, ['Refunded Amount'])) : 0;
    const source = get(row, ['Source']) || 'Unknown';
    const gateway = get(row, ['Payment Method', 'Gateway']) || 'Unknown';
    const status = get(row, ['Financial Status']).toLowerCase();
    const cancelled = get(row, ['Canceled at', 'Cancelled at']);
    const test = /^(true|yes|1)$/i.test(get(row, ['Test', 'Test order'])) || /^(bogus|\(for testing\) bogus gateway|test)$/i.test(gateway);
    const renewal = /^(true|yes|1)$/i.test(get(row, ['Subscription renewal']));
    const excluded = test ? 'Test order' : renewal ? 'Explicit subscription renewal' : /^(pos|(?:shopify_)?draft[ _]order|manual)$/i.test(source) ? 'POS, draft or manual source' : status === 'refunded' || (total > 0 && refund >= total) ? 'Refunded in full' : cancelled && !get(row, ['Paid at']) && /^(pending|voided|authorized|unpaid)$/.test(status) ? 'Cancelled before payment' : '';
    const keys = [
      { key: 'Mapped ID', value: id },
      ...['Name', 'Order number', 'Id', 'Checkout token'].map((key) => ({ key, value: get(row, [key]) })),
    ].filter((candidate) => candidate.value);
    const ordered = [...keys.slice(1), keys[0]].filter((key): key is CandidateKey => Boolean(key));
    return {
      id, keys: ordered, day: propertyDay(cell(table, row, columns.date), settings.timeZone),
      value: settings.netRefunds ? Math.max(0, value - refund) : value,
      currency: currencyCode(cell(table, row, columns.currency)), gateway, source, excluded,
      notes: [
        ...(refund > 0 && refund < total ? ['Partial refund: check whether the selected value basis includes refunded tax or shipping.'] : []),
        ...(!findHeader(table, ['Test', 'Test order']) ? ['Test status is unavailable unless the payment method identifies a test.'] : []),
      ],
    };
  });
}

export function ga4Purchases(input: ExportInput, settings: ComparisonSettings): readonly Purchase[] {
  const { table, columns } = input;
  const countHeader = findHeader(table, ['Ecommerce purchases', 'ecommerce_purchases']);
  return table.rows.flatMap((row, index) => {
    const id = cell(table, row, columns.id);
    if (!id && !cell(table, row, columns.date)) return [];
    const count = countHeader ? amount(cell(table, row, countHeader)) : 1;
    if (!Number.isInteger(count) || count < 0) throw new CsvError('Ecommerce purchases must contain whole, non-negative counts.');
    if (count === 0) return [];
    return [{
      row: index + 2, id: /^(\(not set\)|\(other\)|not set)$/i.test(id) ? '' : normalizeId(id),
      day: propertyDay(cell(table, row, columns.date), settings.timeZone),
      value: amount(cell(table, row, columns.revenue)),
      currency: currencyCode(settings.localCurrency ? cell(table, row, columns.currency) : settings.reportingCurrency), count,
    }];
  });
}
