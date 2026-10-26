import { COLUMNS, type Application } from './types';
import { parseDate } from './dates';
import { higherStage, isStatus, normalizeStatus } from './statuses';

/**
 * Превращает строки таблицы в объекты. Колонки ищутся по заголовкам, а не по позиции:
 * можно переставлять колонки или вести упрощённую таблицу куратора из 4 колонок.
 */
export function rowsToApplications(values: string[][], today: string): Application[] {
  if (!values.length) return [];
  const header = values[0].map((h) => h.trim().toLowerCase());
  const idx = (title: string) => header.indexOf(title.toLowerCase());
  const pos = Object.fromEntries(COLUMNS.map((c) => [c.key, idx(c.title)])) as Record<keyof Application, number>;
  const get = (row: string[], k: keyof Application) => (pos[k] >= 0 ? (row[pos[k]] ?? '').toString().trim() : '');

  return values.slice(1).flatMap((row, i) => {
    if (!row.some((c) => String(c ?? '').trim())) return [];
    const status = normalizeStatus(get(row, 'status'));
    const rawMax = get(row, 'maxStage');
    const maxStage = higherStage(isStatus(rawMax) ? rawMax : '', status);
    const date = parseDate(get(row, 'date'), today);
    return [
      {
        id: get(row, 'id') || `r${i + 2}`,
        date,
        channel: get(row, 'channel'),
        company: get(row, 'company'),
        title: get(row, 'title'),
        url: get(row, 'url'),
        status,
        maxStage,
        letter: get(row, 'letter'),
        updated: parseDate(get(row, 'updated'), today) || date,
        source: get(row, 'source') || 'вручную',
        notes: get(row, 'notes'),
      },
    ];
  });
}

export function applicationToRow(a: Application): string[] {
  return COLUMNS.map((c) => String(a[c.key] ?? ''));
}

/** Небольшой CSV-парсер (RFC 4180): кавычки, переводы строк внутри ячеек. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}
