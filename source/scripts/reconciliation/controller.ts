import shopifySample from '../../lib/reconciliation/samples/shopify.csv?raw';
import ga4Sample from '../../lib/reconciliation/samples/ga4.csv?raw';
import { CsvError, parseCsv, type CsvTable } from '../../lib/reconciliation/csv.ts';
import { detectColumns } from '../../lib/reconciliation/columns.ts';
import { ga4Purchases, shopifyOrders, type ComparisonSettings } from '../../lib/reconciliation/records.ts';
import { currencyCode } from '../../lib/reconciliation/values.ts';
import { reconcile, type LedgerRow } from '../../lib/reconciliation/match.ts';
import { download, renderResults, resultCsv } from './render.ts';
import { mappingControls, selectedColumns } from './mapping.ts';

const form = document.querySelector<HTMLFormElement>('#rc-form');
const status = document.querySelector<HTMLElement>('#rc-status');
const output = document.querySelector<HTMLElement>('#rc-output');
const downloadButton = document.querySelector<HTMLButtonElement>('#rc-download');
const resultSection = document.querySelector<HTMLElement>('#rc-results');
const slots: { readonly id: string; table: CsvTable | undefined; version: number }[] = [
  { id: 'shopify', table: undefined, version: 0 },
  { id: 'ga4', table: undefined, version: 0 },
];
let ledger: readonly LedgerRow[] = [];

function invalidate(): void {
  ledger = [];
  if (downloadButton) downloadButton.disabled = true;
  if (resultSection) resultSection.hidden = true;
  output?.replaceChildren();
}

function announce(message: string, tone: 'neutral' | 'ready' | 'error' = 'neutral'): void {
  if (status) { status.textContent = message; status.dataset.tone = tone; }
}

function fileError(index: number, message: string): void {
  const id = slots[index].id;
  const error = document.querySelector<HTMLElement>(`#rc-${id}-error`);
  const input = document.querySelector<HTMLInputElement>(`#rc-${id}`);
  if (error) { error.textContent = message; error.hidden = !message; }
  if (message) input?.setAttribute('aria-invalid', 'true');
  else input?.removeAttribute('aria-invalid');
}

function load(text: string, index: number): void {
  const slot = slots[index];
  const mapping = document.querySelector<HTMLElement>(`#rc-${slot.id}-mapping`);
  if (!mapping) return;
  slot.table = parseCsv(text);
  fileError(index, '');
  mappingControls(mapping, slot.table, detectColumns(slot.table, index === 0));
  announce((index === 0 ? 'Shopify' : 'GA4') + ' CSV loaded. Check its columns.');
}

async function readFile(file: File, index: number): Promise<void> {
  const slot = slots[index];
  const version = ++slot.version;
  invalidate(); slot.table = undefined;
  fileError(index, '');
  document.querySelector(`#rc-${slot.id}-mapping`)?.replaceChildren();
  announce('Reading CSV locally…');
  try {
    if (!/\.csv$/i.test(file.name)) throw new CsvError('Choose a .csv file. Spreadsheets, images and text documents are not supported.');
    if (file.size > 10 * 1024 * 1024) throw new CsvError('Each CSV must be 10 MB or smaller.');
    const text = await file.text();
    if (version === slot.version) load(text, index);
  } catch (error) {
    if (version !== slot.version) return;
    if (!(error instanceof Error)) throw error;
    const message = error instanceof CsvError ? error.message : 'The file could not be read. Choose a CSV export again.';
    fileError(index, message);
    announce((index === 0 ? 'Shopify CSV: ' : 'GA4 CSV: ') + message, 'error');
  }
}

function settings(): ComparisonSettings {
  const value = (name: string) => form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value || '';
  const timeZone = value('timeZone');
  try { new Intl.DateTimeFormat('en', { timeZone }).format(0); }
  catch (error) { if (error instanceof RangeError) throw new CsvError('Enter a valid IANA time zone, such as Europe/Madrid or UTC.'); else throw error; }
  const reportingCurrency = currencyCode(value('reportingCurrency'));
  const absoluteTolerance = Number(value('absoluteTolerance')), percentTolerance = Number(value('percentTolerance'));
  if (!Number.isFinite(absoluteTolerance) || !Number.isFinite(percentTolerance) || absoluteTolerance < 0 || percentTolerance < 0) throw new CsvError('Tolerances must be zero or a positive number.');
  if (value('currencyMode') === 'report' && !reportingCurrency) throw new CsvError('Enter the currency used for GA4 report revenue.');
  return { timeZone, reportingCurrency, absoluteTolerance, percentTolerance, localCurrency: value('currencyMode') === 'local', netRefunds: value('refundBasis') === 'net' };
}

form?.addEventListener('submit', (event) => {
  event.preventDefault(); invalidate();
  try {
    const config = settings();
    const inputs = slots.map((slot) => {
      const root = document.querySelector<HTMLElement>(`#rc-${slot.id}-mapping`);
      if (!slot.table || !root) throw new CsvError('Choose both CSV files, or load the sample data.');
      const columns = selectedColumns(root);
      if (!columns.id || !columns.date || !columns.revenue) throw new CsvError('Choose ID, date and revenue columns for both exports.');
      if (new Set([columns.id, columns.date, columns.revenue]).size !== 3) throw new CsvError('ID, date and revenue need different columns.');
      return { table: slot.table, columns };
    });
    ledger = reconcile(shopifyOrders(inputs[0], config), ga4Purchases(inputs[1], config), config);
    if (output) renderResults(output, ledger);
    if (resultSection) resultSection.hidden = false;
    if (downloadButton) downloadButton.disabled = false;
    announce('Comparison complete. The ledger shows differences in these exports, not their cause.', 'ready');
  } catch (error) {
    if (error instanceof CsvError) announce(error.message, 'error');
    else throw error;
  }
});

slots.forEach((slot, index) => {
  document.querySelector<HTMLInputElement>(`#rc-${slot.id}`)?.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.files?.[0]) void readFile(event.target.files[0], index);
  });
  const drop = document.querySelector<HTMLElement>(`#rc-${slot.id}-drop`);
  drop?.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('rc-drag'); });
  drop?.addEventListener('dragleave', () => drop.classList.remove('rc-drag'));
  drop?.addEventListener('drop', (event) => {
    event.preventDefault(); drop.classList.remove('rc-drag');
    if (!event.dataTransfer?.files.length) return;
    if (event.dataTransfer.files.length !== 1) {
      invalidate(); slot.table = undefined; slot.version++;
      document.querySelector(`#rc-${slot.id}-mapping`)?.replaceChildren();
      fileError(index, 'Drop one CSV file in each file area.');
      announce((index === 0 ? 'Shopify CSV: ' : 'GA4 CSV: ') + 'Drop one CSV file in each file area.', 'error');
      return;
    }
    if (!drop.hasAttribute('data-ds-file-drop')) void readFile(event.dataTransfer.files[0], index);
  });
});
form?.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type === 'file') return;
  invalidate(); announce('Settings changed. Compare exports again to update the ledger.');
});
document.querySelector('#rc-sample')?.addEventListener('click', () => {
  form?.reset(); invalidate(); slots.forEach((slot) => slot.version++);
  load(shopifySample, 0); load(ga4Sample, 1);
  announce('Synthetic sample data loaded. Compare exports to see every result bucket.');
});
document.querySelector('#rc-reset')?.addEventListener('click', () => {
  form?.reset(); invalidate();
  slots.forEach((slot, index) => { slot.version++; slot.table = undefined; fileError(index, ''); document.querySelector(`#rc-${slot.id}-mapping`)?.replaceChildren(); });
  announce('Files and results cleared from this page.');
});
downloadButton?.addEventListener('click', () => { if (ledger.length) download(resultCsv(ledger), 'shopify-ga4-reconciliation.csv'); });
document.querySelector('#rc-shopify-sample')?.addEventListener('click', () => download(shopifySample, 'synthetic-shopify-orders.csv'));
document.querySelector('#rc-ga4-sample')?.addEventListener('click', () => download(ga4Sample, 'synthetic-ga4-purchases.csv'));
