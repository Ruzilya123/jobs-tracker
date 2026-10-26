import { describe, expect, it } from 'vitest';
import { detectChannel, extractUrls, vacancyKey } from '../../core/channel';
import { addDays, parseDate } from '../../core/dates';
import { canAutoTransition, normalizeStatus } from '../../core/statuses';
import { computeAudit, streak } from '../../core/stats';
import { parseCSV, rowsToApplications } from '../../core/rows';
import type { Application } from '../../core/types';

const app = (p: Partial<Application>): Application => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-10-27',
  channel: 'hh.ru',
  company: '',
  title: '',
  url: '',
  status: 'Отправлено',
  maxStage: '',
  letter: '',
  updated: '',
  source: 'вручную',
  notes: '',
  ...p,
});

describe('каналы и ссылки', () => {
  it('узнаёт площадки', () => {
    expect(detectChannel('https://hh.ru/vacancy/138140978')).toBe('hh.ru');
    expect(detectChannel('https://ufa.hh.ru/vacancy/1')).toBe('hh.ru');
    expect(detectChannel('https://career.habr.com/vacancies/1000150678')).toBe('Хабр Карьера');
    expect(detectChannel('https://t.me/fordev/123')).toBe('Telegram: @fordev');
    expect(detectChannel('https://example.ru/careers', '@frontend_jobs')).toBe('Telegram: @frontend_jobs');
    expect(detectChannel('https://void.ru/jobs')).toBe('Сайт компании');
  });
  it('один ключ для одной вакансии с разных доменов', () => {
    expect(vacancyKey('https://ufa.hh.ru/vacancy/123?from=main')).toBe(vacancyKey('hh.ru/vacancy/123'));
  });
  it('достаёт ссылки из текста', () => {
    expect(extractUrls('Вакансия: hh.ru/vacancy/5, пишите!')).toEqual(['https://hh.ru/vacancy/5']);
    expect(extractUrls('в т.ч. React')).toEqual([]);
  });
});

describe('даты', () => {
  it('понимает ручной ввод', () => {
    expect(parseDate('27.10', '2026-10-30')).toBe('2026-10-27');
    expect(parseDate('27.10.2026', '2026-10-30')).toBe('2026-10-27');
    expect(parseDate('28.12', '2027-01-05')).toBe('2026-12-28');
    expect(parseDate('2026-10-27', '2026-10-30')).toBe('2026-10-27');
  });
});

describe('статусы', () => {
  it('нормализует ручной ввод из примера куратора', () => {
    expect(normalizeStatus('отказ')).toBe('Отказ');
    expect(normalizeStatus('просмотрен')).toBe('Просмотрено');
    expect(normalizeStatus('нет ответа')).toBe('Без ответа (>10 дней)');
    expect(normalizeStatus('приглашение')).toBe('Приглашение');
  });
  it('письмо не откатывает статус назад', () => {
    expect(canAutoTransition('Интервью 1 этап', 'Просмотрено')).toBe(false);
    expect(canAutoTransition('Отправлено', 'Приглашение')).toBe(true);
    expect(canAutoTransition('Интервью 2 этап', 'Отказ')).toBe(true);
    expect(canAutoTransition('Оффер', 'Отказ')).toBe(false);
    expect(canAutoTransition('Без ответа (>10 дней)', 'Просмотрено')).toBe(true);
  });
});

describe('аудит', () => {
  const today = '2026-10-31';
  const apps = [
    app({ date: '2026-10-27', channel: 'hh.ru', status: 'Отказ', maxStage: 'Интервью 1 этап', letter: 'real-time' }),
    app({ date: '2026-10-27', channel: 'hh.ru', status: 'Отправлено', letter: 'legacy' }),
    app({ date: '2026-10-28', channel: 'Telegram: @fordev', status: 'Приглашение', letter: 'real-time' }),
    app({ date: '2026-10-29', channel: 'Telegram: @frontend', status: 'Отказ', letter: 'legacy' }),
    app({ date: '2026-10-10', channel: 'Сайт компании', status: 'Отправлено' }),
  ];
  const a = computeAudit(apps, { today, days: 7 });

  it('считает воронку с учётом максимального этапа', () => {
    expect(a.total).toBe(4);
    expect(a.invited).toBe(2); // отказ после интервью тоже был приглашением
    expect(a.interviews).toBe(1);
    expect(a.conv.invite.value).toBe(0.5);
    expect(a.conv.invite.verdict).toBe('выше нормы');
  });
  it('группирует Telegram-каналы и письма', () => {
    expect(a.byChannel.find((c) => c.name === 'Telegram')?.total).toBe(2);
    expect(a.byLetter.find((c) => c.name === 'real-time')?.invited).toBe(2);
  });
  it('находит зависшие отклики', () => {
    expect(a.stale.map((s) => s.channel)).toEqual(['Сайт компании']);
  });
  it('серия не рвётся на выходных', () => {
    // пт 30.10, сб/вс пропущены, пн 02.11
    const s = new Set(['2026-10-29', '2026-10-30', '2026-11-02']);
    expect(streak(s, '2026-11-02')).toBe(3);
    expect(streak(s, addDays('2026-11-02', 1))).toBe(3); // сегодня ещё не откликалась — серия жива
  });
});

describe('таблица', () => {
  it('читает упрощённую таблицу куратора из CSV', () => {
    const csv = 'Дата отклика,Канал,Ссылка на вакансию,Статус\n27.10,hh.ru,hh.ru/vacancy/00000001,отказ\n"28.10","Telegram-канал «Дизайн, вакансии»",t.me/example/101,нет ответа\n';
    const rows = rowsToApplications(parseCSV(csv), '2026-11-01');
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('Отказ');
    expect(rows[1].channel).toBe('Telegram-канал «Дизайн, вакансии»');
    expect(rows[1].date).toBe('2026-10-28');
  });
});
