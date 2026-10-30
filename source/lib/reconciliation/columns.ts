import type { CsvTable } from './csv.ts';

export type ColumnMap = {
  readonly id: string;
  readonly date: string;
  readonly revenue: string;
  readonly currency: string;
};
export const fields = ['id', 'date', 'revenue', 'currency'] as const;
export const fieldLabels = { id: 'Order / transaction ID', date: 'Date', revenue: 'Revenue', currency: 'Currency (optional)' } as const;

export function findHeader(table: CsvTable, names: readonly string[]): string {
  return table.headers.find((header) => names.some((name) => name.toLowerCase() === header.toLowerCase())) || '';
}

export function detectColumns(table: CsvTable, shopify: boolean): ColumnMap {
  return {
    id: findHeader(table, shopify ? ['Name', 'Id', 'Order number'] : ['Transaction ID', 'transaction_id', 'ecommerce.transaction_id']),
    date: findHeader(table, shopify ? ['Created at', 'created_at'] : ['Date', 'event_date']),
    revenue: findHeader(table, shopify ? ['Subtotal', 'Total'] : ['Purchase revenue', 'Gross purchase revenue', 'purchase_revenue', 'ecommerce.purchase_revenue']),
    currency: findHeader(table, ['Currency', 'currency_code']),
  };
}

export function cell(table: CsvTable, row: readonly string[], header: string): string {
  return (row[table.headers.indexOf(header)] || '').trim();
}
