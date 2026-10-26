import type { Status } from './statuses';

/** Одна строка таблицы откликов. Порядок полей = порядок колонок в Google Sheets. */
export interface Application {
  id: string;
  date: string; // YYYY-MM-DD — дата отклика
  channel: string; // hh.ru, Хабр Карьера, Telegram: @channel, Сайт компании…
  company: string;
  title: string;
  url: string;
  status: Status;
  maxStage: Status | ''; // самый далёкий этап воронки, до которого дошёл отклик
  letter: string; // вариант сопроводительного письма (для A/B)
  updated: string; // YYYY-MM-DD — когда статус менялся последний раз
  source: 'почта' | 'бот' | 'вручную' | string;
  notes: string;
}

export const COLUMNS: { key: keyof Application; title: string }[] = [
  { key: 'id', title: 'ID' },
  { key: 'date', title: 'Дата отклика' },
  { key: 'channel', title: 'Канал' },
  { key: 'company', title: 'Компания' },
  { key: 'title', title: 'Вакансия' },
  { key: 'url', title: 'Ссылка на вакансию' },
  { key: 'status', title: 'Статус' },
  { key: 'maxStage', title: 'Макс. этап' },
  { key: 'letter', title: 'Письмо' },
  { key: 'updated', title: 'Обновлено' },
  { key: 'source', title: 'Источник' },
  { key: 'notes', title: 'Заметки' },
];
