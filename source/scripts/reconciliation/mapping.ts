import type { CsvTable } from '../../lib/reconciliation/csv.ts';
import { fields, fieldLabels, type ColumnMap } from '../../lib/reconciliation/columns.ts';

export function mappingControls(root: HTMLElement, table: CsvTable, columns: ColumnMap): void {
  root.replaceChildren();
  const note = document.createElement('p');
  note.textContent = columns.id && columns.date && columns.revenue ? 'Columns detected. Check the value basis before comparing.' : 'Choose the columns for this export, then compare again.';
  root.append(note);
  for (const key of fields) {
    const field = document.createElement('div');
    field.className = 'ds-field ds-field--wide';
    const label = document.createElement('label'), select = document.createElement('select');
    select.id = `${root.id}-${key}`; label.htmlFor = select.id;
    label.textContent = fieldLabels[key]; select.dataset.column = key;
    select.required = key !== 'currency';
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = key === 'currency' ? 'Unavailable / use reporting currency' : 'Choose a column'; select.append(blank);
    for (const header of table.headers) { const option = document.createElement('option'); option.value = header; option.textContent = header; select.append(option); }
    select.value = columns[key]; field.append(label, select); root.append(field);
  }
}

export function selectedColumns(root: HTMLElement): ColumnMap {
  const value = (key: string) => root.querySelector<HTMLSelectElement>(`select[data-column="${key}"]`)?.value || '';
  return { id: value('id'), date: value('date'), revenue: value('revenue'), currency: value('currency') };
}
