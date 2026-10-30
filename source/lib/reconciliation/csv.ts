export class CsvError extends Error {
  constructor(message: string) { super(message); this.name = 'CsvError'; }
}

export type CsvTable = {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

export function parseCsv(text: string): CsvTable {
  if (new TextEncoder().encode(text).length > 10 * 1024 * 1024) throw new CsvError('Each CSV must be 10 MB or smaller.');
  const records: string[][] = [];
  let record: string[] = [], field = '', quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"') {
      if (field || closed) throw new CsvError('Invalid CSV quotation. Export the file as CSV again.');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      record.push(field); field = ''; closed = false;
      if (char !== ',') {
        records.push(record); record = [];
        if (char === '\r' && input[i + 1] === '\n') i++;
      }
    } else {
      if (closed) throw new CsvError('Unexpected text after a quoted CSV cell.');
      field += char;
    }
  }
  if (quoted) throw new CsvError('Unclosed quote in CSV. Export the file again.');
  if (field || record.length || closed) records.push([...record, field]);
  const meaningful = records.filter((row) => row.some((cell) => cell.trim()));
  // GA4 metadata precedes the header; data rows such as #1001 are never comments.
  while (meaningful[0]?.[0]?.trim().startsWith('#')) meaningful.shift();
  const headers = meaningful.shift()?.map((cell) => cell.trim()) || [];
  if (headers.length < 2) throw new CsvError('This is not a CSV table. Choose an orders or GA4 CSV export.');
  if (new Set(headers.map((h) => h.toLowerCase())).size !== headers.length) throw new CsvError('CSV column names must be unique.');
  if (!meaningful.length) throw new CsvError('The CSV has no data rows.');
  if (meaningful.length > 50000) throw new CsvError('Each CSV must contain no more than 50,000 data rows.');
  if (meaningful.some((row) => row.length !== headers.length)) throw new CsvError('CSV rows have different column counts. Use a flat table without pivots.');
  return { headers, rows: meaningful };
}

export function csvDownload(rows: readonly (readonly (string | number)[])[]): string {
  return '\uFEFF' + rows.map((row) => row.map((value) => {
    const text = String(value);
    const safe = typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
