// Статусы ровно в формулировках из инструкции куратора.
export const STATUSES = [
  'Отправлено',
  'Просмотрено',
  'Приглашение',
  'Интервью 1 этап',
  'Тестовое задание',
  'Интервью 2 этап',
  'Оффер',
  'Отказ',
  'Без ответа (>10 дней)',
  'Снял отклик',
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_HINTS: Record<Status, string> = {
  'Отправлено': 'Отклик ушёл, ждёте ответа',
  'Просмотрено': 'Рекрутер открыл резюме',
  'Приглашение': 'Позвали на интервью / скрининг',
  'Интервью 1 этап': 'Скрининг или первое собеседование с HR',
  'Тестовое задание': 'Дали задачу — делаете',
  'Интервью 2 этап': 'Собеседование с руководителем',
  'Оффер': 'Предложили условия',
  'Отказ': 'Пришёл отрицательный ответ',
  'Без ответа (>10 дней)': 'Тишина — follow-up или закрыть',
  'Снял отклик': 'Сама отказалась',
};

/** Насколько далеко продвинулся отклик по воронке. Финальные статусы — отдельно. */
const PROGRESS: Partial<Record<Status, number>> = {
  'Отправлено': 1,
  'Без ответа (>10 дней)': 1.5,
  'Просмотрено': 2,
  'Приглашение': 3,
  'Интервью 1 этап': 4,
  'Тестовое задание': 5,
  'Интервью 2 этап': 6,
  'Оффер': 7,
};

export const FINAL_STATUSES: Status[] = ['Отказ', 'Снял отклик', 'Оффер'];

export function isStatus(s: string): s is Status {
  return (STATUSES as readonly string[]).includes(s);
}

/** Нормализует то, что ввели руками в таблицу: «отказ», «просмотрен», «нет ответа» и т.п. */
export function normalizeStatus(raw: string): Status {
  const s = raw.trim().toLowerCase();
  if (!s) return 'Отправлено';
  const exact = STATUSES.find((x) => x.toLowerCase() === s);
  if (exact) return exact;
  if (s.startsWith('просмотр')) return 'Просмотрено';
  if (s.startsWith('приглаш')) return 'Приглашение';
  if (s.includes('тестов')) return 'Тестовое задание';
  if (s.includes('2 этап') || s.includes('второе')) return 'Интервью 2 этап';
  if (s.includes('интервью') || s.includes('собесед') || s.includes('скрининг')) return 'Интервью 1 этап';
  if (s.startsWith('оффер') || s.startsWith('offer')) return 'Оффер';
  if (s.startsWith('отказ')) return 'Отказ';
  if (s.includes('без ответа') || s.includes('нет ответа')) return 'Без ответа (>10 дней)';
  if (s.includes('снял') || s.includes('сняла')) return 'Снял отклик';
  return 'Отправлено';
}

/**
 * Можно ли автоматически (из письма) перевести отклик из `from` в `to`.
 * Ручные изменения через бота разрешены всегда — эта функция только для автоматики,
 * чтобы письмо «резюме просмотрено» не откатило уже назначенное интервью.
 */
export function canAutoTransition(from: Status, to: Status): boolean {
  if (from === to) return false;
  if (from === 'Оффер' || from === 'Снял отклик') return false;
  if (to === 'Отказ') return from !== 'Отказ';
  if (from === 'Отказ') return false;
  const a = PROGRESS[from] ?? 0;
  const b = PROGRESS[to] ?? 0;
  return b > a;
}

export function progressOf(s: Status | ''): number {
  return s ? PROGRESS[s] ?? 0 : 0;
}

/**
 * «Максимальный этап» хранится отдельной колонкой: если после интервью пришёл отказ,
 * отклик всё равно должен учитываться в конверсии «приглашение → интервью».
 */
export function higherStage(a: Status | '', b: Status | ''): Status | '' {
  return progressOf(b) > progressOf(a) ? b : a;
}

export const reachedInvite = (maxStage: Status | '') => progressOf(maxStage) >= 3;
export const reachedInterview = (maxStage: Status | '') => progressOf(maxStage) >= 4;
export const reachedOffer = (maxStage: Status | '') => progressOf(maxStage) >= 7;

export function isWaiting(s: Status): boolean {
  return s === 'Отправлено' || s === 'Просмотрено';
}
