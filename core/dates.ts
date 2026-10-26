/** Все даты внутри проекта — строки YYYY-MM-DD в часовом поясе пользователя. */

export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function hourIn(tz: string, now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(now)) % 24;
}

const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / 86_400_000);
}

export function addDays(d: string, n: number): string {
  return new Date(toUTC(d) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = воскресенье … 6 = суббота */
export function weekday(d: string): number {
  return new Date(toUTC(d)).getUTCDay();
}

export const isWorkday = (d: string) => weekday(d) !== 0 && weekday(d) !== 6;

/**
 * Понимает то, что люди пишут в таблице руками:
 * 2026-10-27, 27.10.2026, 27.10.26, 27.10 (текущий год), а также серийный номер даты Google Sheets.
 */
export function parseDate(raw: string, today: string): string {
  const s = raw.trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (m) {
    let y = m[3] ? +m[3] : +today.slice(0, 4);
    if (y < 100) y += 2000;
    const d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    // «27.12» в январе — это прошлый год
    return !m[3] && d > addDays(today, 1) ? `${y - 1}${d.slice(4)}` : d;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Google Sheets serial: 1899-12-30 + N дней
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86_400_000).toISOString().slice(0, 10);
  }
  return '';
}

export function formatRu(d: string): string {
  return d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '';
}
