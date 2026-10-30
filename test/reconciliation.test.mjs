import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, csvDownload, CsvError } from '../source/lib/reconciliation/csv.ts';
import { detectColumns } from '../source/lib/reconciliation/columns.ts';
import { shopifyOrders, ga4Purchases } from '../source/lib/reconciliation/records.ts';
import { reconcile } from '../source/lib/reconciliation/match.ts';
import { normalizeId, amount, propertyDay } from '../source/lib/reconciliation/values.ts';

const settings = Object.freeze({ timeZone: 'UTC', reportingCurrency: 'USD', localCurrency: false, netRefunds: false, absoluteTolerance: .5, percentTolerance: 1 });
const input = (name, shopify) => {
  const table = parseCsv(readFileSync(new URL(`../source/lib/reconciliation/samples/${name}.csv`, import.meta.url), 'utf8'));
  return { table, columns: detectColumns(table, shopify) };
};
const orders = shopifyOrders(input('shopify', true), settings);
const purchases = ga4Purchases(input('ga4', false), settings);
const ledger = reconcile(orders, purchases, settings);
const order = (id) => ledger.find(row => row.side === 'Shopify' && row.id === id);

test('sample exports distinguish matched, missing and value differences', () => {
  assert.deepEqual(['#1001', '#1002', '#1003'].map(id => order(id).bucket), ['matched', 'difference', 'missing']);
  assert.equal(order('#1002').delta, -20);
});

test('line-item continuation rows count once per Shopify order', () => {
  assert.equal(orders.filter(row => row.id === '#1001').length, 1);
  assert.equal(orders.length, 15);
});

test('test, POS, draft, full-refund and renewal orders are excluded', () => {
  assert.deepEqual(['#1004', '#1005', '#1006', '#1007', '#1008', '#1009'].map(id => order(id).bucket), Array(6).fill('excluded'));
});

test('duplicate GA4 IDs sum values and retain duplicate review rows', () => {
  assert.equal(order('#1010').ga4Value, 200);
  assert.equal(ledger.filter(row => row.side === 'GA4' && row.id === '1010' && row.bucket === 'duplicate').length, 2);
});

test('currency mismatches and colliding normalized IDs require review', () => {
  assert.equal(order('#1013').bucket, 'currency');
  assert.equal(order('#1013').delta, '');
  assert.deepEqual(['#1014', '#01014'].map(id => order(id).bucket), ['ambiguous', 'ambiguous']);
});

test('net refund setting subtracts the partial refund from the selected basis', () => {
  const net = shopifyOrders(input('shopify', true), { ...settings, netRefunds: true });
  assert.equal(net.find(row => row.id === '#1011').value, 80);
});

test('absolute and percentage tolerances use the larger allowed difference', () => {
  const source = orders.find(row => row.id === '#1001');
  const purchase = purchases.find(row => row.id === '1001');
  const rows = reconcile([source], [{ ...purchase, value: 101 }], settings);
  assert.equal(rows[0].bucket, 'matched');
  assert.equal(reconcile([source], [{ ...purchase, value: 101.01 }], settings)[0].bucket, 'difference');
});

test('IDs, amounts and property-zone days normalize without converting currency', () => {
  assert.equal(normalizeId('gid://shopify/Order/000123'), '123');
  assert.equal(amount('1,234.50'), 1234.5);
  assert.equal(propertyDay('2026-10-01 23:30:00 -0400', 'UTC'), '2026-10-02');
  assert.throws(() => propertyDay('2026-02-30', 'UTC'), CsvError);
  assert.throws(() => amount('12 EUR'), CsvError);
});

test('CSV parser handles quoted commas and rejects malformed rows', () => {
  assert.deepEqual(parseCsv('id,name\n1,"item, extra"').rows, [['1', 'item, extra']]);
  assert.throws(() => parseCsv('id,name\n1,"broken'), CsvError);
  assert.throws(() => parseCsv('id,name\n1,2,3'), CsvError);
  assert.throws(() => parseCsv('id,ID\n1,2'), CsvError);
});

test('CSV export neutralizes spreadsheet formulas in text cells', () => {
  const csv = csvDownload([['=1+1', '+cmd', '-text', '@SUM(1)', -5]]);
  assert.deepEqual(parseCsv('a,b,c,d,e\n' + csv.replace(/^\uFEFF/, '')).rows[0], ["'=1+1", "'+cmd", "'-text", "'@SUM(1)", '-5']);
});
