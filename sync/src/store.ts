import { COLUMNS, type Application } from '../../core/types';
import { newId, rowsToApplications } from '../../core/rows';
import { vacancyKey } from '../../core/channel';
import { canAutoTransition, higherStage, type Status } from '../../core/statuses';
import { SheetsClient } from './sheets';
import { config } from './config';

const colLetter = (i: number) => {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]+/giu, ' ').trim();

/**
 * Таблица откликов в памяти: загружаем один раз, меняем, в конце одной пачкой пишем изменения.
 * Строки адресуются по колонке ID — можно сортировать и фильтровать таблицу руками, ничего не сломается.
 */
export class Store {
  apps: Application[] = [];
  private header: string[] = [];
  private rowOf = new Map<string, number>();
  private nextRow = 2;
  private dirty = new Set<string>();
  private state = new Map<string, { row: number; value: string }>();
  private stateDirty = new Set<string>();

  constructor(
    readonly client: SheetsClient,
    readonly today: string,
  ) {}

  async load() {
    const values = await this.client.get(config.sheet, 'A1:Z');
    this.header = (values[0] ?? []).map((h) => h.trim());
    if (!this.header.includes('ID')) throw new Error(`В листе «${config.sheet}» нет колонки ID. Запустите: npm run setup`);
    this.apps = rowsToApplications(values, this.today);
    // номер строки для каждого отклика (пустые строки в таблице пропускаются при разборе)
    let k = 0;
    values.slice(1).forEach((row, i) => {
      if (!row.some((c) => String(c ?? '').trim())) return;
      const app = this.apps[k++];
      const hadId = row[this.header.indexOf('ID')]?.trim();
      if (!hadId) {
        app.id = newId(); // строку добавили руками — выдаём ID
        this.dirty.add(app.id);
      }
      this.rowOf.set(app.id, i + 2);
    });
    this.nextRow = values.length + 1;

    const st = await this.client.get(config.stateSheet, 'A1:B');
    st.forEach(([k, v], i) => k && this.state.set(k, { row: i + 1, value: v ?? '' }));

    // ручные правки статуса в таблице → дотягиваем «Макс. этап»
    for (const a of this.apps) {
      const m = higherStage(a.maxStage, a.status);
      if (m !== a.maxStage) (a.maxStage = m), this.dirty.add(a.id);
    }
    return this;
  }

  get(id: string) {
    return this.apps.find((a) => a.id === id);
  }

  findByUrl(url: string) {
    const k = vacancyKey(url);
    return k ? this.apps.find((a) => vacancyKey(a.url) === k) : undefined;
  }

  findByTitle(company: string, title: string) {
    if (!title) return undefined;
    const t = norm(title);
    const c = norm(company);
    const sameTitle = this.apps.filter((a) => norm(a.title) === t);
    if (c) return sameTitle.find((a) => norm(a.company) === c || !a.company);
    return sameTitle.length === 1 ? sameTitle[0] : undefined;
  }

  add(partial: Partial<Application> & { channel: string }): Application {
    const app: Application = {
      id: newId(),
      date: this.today,
      company: '',
      title: '',
      url: '',
      status: 'Отправлено',
      maxStage: 'Отправлено',
      letter: '',
      updated: this.today,
      source: 'вручную',
      notes: '',
      ...partial,
    };
    app.maxStage = higherStage(app.maxStage, app.status);
    this.apps.push(app);
    this.rowOf.set(app.id, this.nextRow++);
    this.dirty.add(app.id);
    return app;
  }

  /** Ручная смена (бот): разрешено всё. */
  setStatus(app: Application, status: Status) {
    if (app.status === status) return false;
    app.status = status;
    app.maxStage = higherStage(app.maxStage, status);
    app.updated = this.today;
    this.dirty.add(app.id);
    return true;
  }

  /** Автоматическая смена (письмо): только «вперёд» по воронке или отказ. */
  autoStatus(app: Application, status: Status) {
    return canAutoTransition(app.status, status) ? this.setStatus(app, status) : false;
  }

  patch(app: Application, p: Partial<Application>) {
    Object.assign(app, p);
    this.dirty.add(app.id);
  }

  getState(key: string) {
    return this.state.get(key)?.value ?? '';
  }

  setState(key: string, value: string | number) {
    const cur = this.state.get(key);
    const row = cur?.row ?? Math.max(0, ...[...this.state.values()].map((s) => s.row)) + 1;
    this.state.set(key, { row, value: String(value) });
    this.stateDirty.add(key);
  }

  async flush() {
    const data: { sheet: string; a1: string; values: string[][] }[] = [];
    for (const id of this.dirty) {
      const app = this.get(id);
      const row = this.rowOf.get(id);
      if (!app || !row) continue;
      for (const c of COLUMNS) {
        const i = this.header.indexOf(c.title);
        if (i < 0) continue;
        data.push({ sheet: config.sheet, a1: `${colLetter(i)}${row}`, values: [[String(app[c.key] ?? '')]] });
      }
    }
    for (const k of this.stateDirty) {
      const s = this.state.get(k)!;
      data.push({ sheet: config.stateSheet, a1: `A${s.row}:B${s.row}`, values: [[k, s.value]] });
    }
    // батчами, чтобы не упереться в лимит размера запроса
    for (let i = 0; i < data.length; i += 400) await this.client.batchValues(data.slice(i, i + 400));
    const n = this.dirty.size;
    this.dirty.clear();
    this.stateDirty.clear();
    return n;
  }
}
