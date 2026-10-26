import { useEffect, useState } from 'react';
import type { Application } from '../../core/types';
import { parseCSV, rowsToApplications } from '../../core/rows';
import { addDays, isWorkday, todayIn } from '../../core/dates';
import { higherStage, type Status } from '../../core/statuses';

export const TZ = 'Asia/Yekaterinburg';
const CSV_URL = import.meta.env.VITE_SHEET_CSV_URL as string | undefined;
const REFRESH_MS = 60_000;

export interface DataState {
  apps: Application[];
  loadedAt: Date | null;
  error: string;
  demo: boolean;
  today: string;
}

/**
 * Данные берутся из опубликованного CSV Google Таблицы и перечитываются раз в минуту.
 * Без VITE_SHEET_CSV_URL дашборд работает в демо-режиме — удобно показывать как портфолио.
 */
export function useApplications(): DataState {
  const demo = !CSV_URL || new URLSearchParams(location.search).has('demo');
  const [state, setState] = useState<DataState>({ apps: [], loadedAt: null, error: '', demo, today: todayIn(TZ) });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const today = todayIn(TZ);
      try {
        const apps = demo
          ? demoData(today)
          : rowsToApplications(
              parseCSV(await (await fetch(`${CSV_URL}${CSV_URL!.includes('?') ? '&' : '?'}t=${Date.now()}`)).text()),
              today,
            );
        if (alive) setState({ apps, loadedAt: new Date(), error: '', demo, today });
      } catch (e) {
        if (alive) setState((s) => ({ ...s, error: `Не удалось загрузить таблицу: ${(e as Error).message}` }));
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [demo]);

  return state;
}

/* ---------------- демо-данные ---------------- */

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const COMPANIES: [string, string, string][] = [
  ['АФЛТ-Системс', 'Frontend-разработчик React', 'hh.ru'],
  ['МТС', 'Frontend-разработчик (МГТС)', 'hh.ru'],
  ['Nord.Codes', 'Frontend Game Developer', 'hh.ru'],
  ['Сотка', 'Middle frontend разработчик', 'hh.ru'],
  ['YeaHub', 'Frontend-разработчик', 'Хабр Карьера'],
  ['VOID', 'Frontend-разработчик', 'hh.ru'],
  ['aQsi', 'Senior Frontend developer (React)', 'hh.ru'],
  ['ГК Орбита', 'Frontend-разработчик (micro frontend)', 'Хабр Карьера'],
  ['Ventra', 'Frontend Developer (AI-first)', 'Telegram: @fordev'],
  ['Альфа-Банк', 'Frontend developer (react/redux)', 'hh.ru'],
  ['Точка', 'React-разработчик', 'Telegram: @frontend_jobs_vakansii'],
  ['Skyeng', 'Frontend-разработчик (EdTech)', 'Хабр Карьера'],
  ['Playrix', 'Web Frontend Developer', 'Сайт компании'],
  ['Контур', 'Frontend-разработчик', 'Сайт компании'],
  ['Selectel', 'React Developer', 'Telegram: @rabota_razrabotchikd'],
  ['2ГИС', 'Frontend-разработчик (карты)', 'Хабр Карьера'],
];

function demoData(today: string): Application[] {
  const r = rng(42);
  const out: Application[] = [];
  for (let d = 24; d >= 0; d--) {
    const date = addDays(today, -d);
    if (!isWorkday(date)) continue;
    const n = d === 0 ? 3 : 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const [company, title, channel] = COMPANIES[Math.floor(r() * COMPANIES.length)];
      const letter = r() < 0.5 ? 'real-time' : r() < 0.6 ? 'legacy' : 'общее';
      const x = r();
      // письмо про real-time конвертится чуть лучше — пусть A/B что-то покажет
      const boost = letter === 'real-time' ? 0.06 : 0;
      let status: Status = 'Отправлено';
      let max: Status | '' = '';
      if (d > 2) {
        if (x < 0.09 + boost) status = d > 5 ? 'Интервью 1 этап' : 'Приглашение';
        else if (x < 0.12 + boost) (status = 'Отказ'), (max = 'Интервью 1 этап');
        else if (x < 0.42) status = 'Отказ';
        else if (x < 0.62) status = 'Просмотрено';
        else if (d > 10 && x < 0.8) status = 'Без ответа (>10 дней)';
      }
      if (d > 12 && x < 0.03) status = 'Интервью 2 этап';
      if (d > 18 && x < 0.015) status = 'Оффер';
      const id = Math.floor(r() * 1e8);
      out.push({
        id: id.toString(36),
        date,
        channel,
        company,
        title,
        url: channel === 'hh.ru' ? `https://hh.ru/vacancy/${138000000 + (id % 900000)}` : channel === 'Хабр Карьера' ? `https://career.habr.com/vacancies/${1000000000 + (id % 99999)}` : '',
        status,
        maxStage: higherStage(max, status),
        letter,
        updated: date,
        source: channel === 'hh.ru' || channel === 'Хабр Карьера' ? 'почта' : 'бот',
        notes: '',
      });
    }
  }
  return out;
}
