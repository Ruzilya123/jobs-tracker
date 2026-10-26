import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import type { SheetsClient } from '../src/sheets';
import { applyEmailEvents } from '../src/email/apply';
import { COLUMNS } from '../../core/types';

/** Таблица в памяти вместо Google Sheets. */
function fakeClient(rows: string[][]) {
  const sheets: Record<string, string[][]> = { 'Отклики': rows, _state: [] };
  const writes: { a1: string; v: string }[] = [];
  const client = {
    async get(sheet: string) {
      return sheets[sheet] ?? [];
    },
    async batchValues(data: { sheet: string; a1: string; values: string[][] }[]) {
      for (const d of data) {
        writes.push({ a1: `${d.sheet}!${d.a1}`, v: d.values[0].join('|') });
        const m = d.a1.match(/^([A-Z]+)(\d+)/)!;
        const r = +m[2] - 1;
        const c = m[1].charCodeAt(0) - 65;
        const t = (sheets[d.sheet] ??= []);
        while (t.length <= r) t.push([]);
        d.values[0].forEach((v, i) => (t[r][c + i] = v));
      }
    },
  } as unknown as SheetsClient;
  return { client, sheets, writes };
}

const header = COLUMNS.map((c) => c.title);

describe('Store', () => {
  it('выдаёт ID строкам, добавленным руками, и дотягивает «Макс. этап»', async () => {
    const { client, sheets } = fakeClient([header, ['', '27.10.2026', 'hh.ru', 'VOID', 'Frontend', 'hh.ru/vacancy/1', 'Приглашение']]);
    const store = await new Store(client, '2026-10-30').load();
    await store.flush();
    const row = sheets['Отклики'][1];
    expect(row[0]).toMatch(/^[a-z0-9]{4,}$/);
    expect(row[7]).toBe('Приглашение');
  });

  it('письмо находит отклик по ссылке и двигает статус, новый — дописывает строкой', async () => {
    const { client, sheets } = fakeClient([header, ['a1', '27.10.2026', 'hh.ru', '', 'Frontend', 'https://ufa.hh.ru/vacancy/555', 'Отправлено', 'Отправлено']]);
    const store = await new Store(client, '2026-10-30').load();
    const date = new Date('2026-10-29T08:00:00Z');
    const changes = applyEmailEvents(store, [
      { kind: 'invite', platform: 'hh.ru', url: 'https://hh.ru/vacancy/555', title: 'Frontend', company: 'VOID', date },
      { kind: 'reject', platform: 'hh.ru', url: 'https://hh.ru/vacancy/999', title: 'React dev', company: 'МТС', date },
    ]);
    await store.flush();
    expect(changes.map((c) => [c.created, c.status])).toEqual([
      [false, 'Приглашение'],
      [true, 'Отказ'],
    ]);
    const [, r1, r2] = sheets['Отклики'];
    expect(r1[3]).toBe('VOID'); // компания подтянулась из письма
    expect(r1[6]).toBe('Приглашение');
    expect(r2[2]).toBe('hh.ru');
    expect(r2[6]).toBe('Отказ');
    expect(r2[10]).toBe('почта');
  });

  it('повторное письмо «просмотрено» не откатывает приглашение', async () => {
    const { client } = fakeClient([header, ['a1', '27.10.2026', 'hh.ru', '', '', 'hh.ru/vacancy/7', 'Приглашение', 'Приглашение']]);
    const store = await new Store(client, '2026-10-30').load();
    const ch = applyEmailEvents(store, [{ kind: 'viewed', platform: 'hh.ru', url: 'hh.ru/vacancy/7', title: '', company: '', date: new Date() }]);
    expect(ch).toHaveLength(0);
    expect(store.apps[0].status).toBe('Приглашение');
  });

  it('хранит служебное состояние в листе _state', async () => {
    const { client, sheets } = fakeClient([header]);
    const store = await new Store(client, '2026-10-30').load();
    store.setState('tg_offset', 42);
    store.setState('last_digest', '2026-10-30');
    await store.flush();
    expect(sheets._state).toEqual([
      ['tg_offset', '42'],
      ['last_digest', '2026-10-30'],
    ]);
  });
});
