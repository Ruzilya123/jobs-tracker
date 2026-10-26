import type { Application } from '../../core/types';
import { daysBetween, hourIn, todayIn } from '../../core/dates';
import { isWaiting } from '../../core/statuses';
import { STALE_DAYS } from '../../core/stats';
import { config, hasEmail, hasTelegram, requireSheets } from './config';
import { SheetsClient } from './sheets';
import { Store } from './store';
import { fetchJobEmails } from './email/imap';
import { classify } from './email/rules';
import { applyEmailEvents } from './email/apply';
import { Telegram, TelegramError } from './telegram/api';
import { handleUpdate, notifyText } from './telegram/handlers';
import { digestText } from './telegram/texts';

let client: SheetsClient | null = null;
export function sheets() {
  if (!client) {
    const { sa, id } = requireSheets();
    client = new SheetsClient(sa, id);
  }
  return client;
}

export const telegram = () => (hasTelegram() ? new Telegram(config.telegram.token) : null);

export async function loadStore() {
  return new Store(sheets(), todayIn(config.tz)).load();
}

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Письма hh.ru / Хабра → статусы в таблице (+ уведомление в Telegram). */
export async function syncEmail(store: Store, tg: Telegram | null) {
  if (!hasEmail()) return log('почта: не настроена (IMAP_USER / IMAP_PASSWORD) — пропускаю');
  const res = await fetchJobEmails({
    lastUid: Number(store.getState('imap_last_uid') || 0),
    uidValidity: store.getState('imap_uidvalidity'),
  });
  const events = res.emails.map(classify).filter((e) => e !== null);
  const changes = applyEmailEvents(store, events);
  store.setState('imap_uidvalidity', res.uidValidity);
  store.setState('imap_last_uid', res.lastUid);
  log(`почта: писем ${res.emails.length}, распознано ${events.filter((e) => e.kind !== 'skip').length}, изменений ${changes.length}`);
  if (tg && config.telegram.ownerId) {
    for (const c of changes) {
      await tg.send(config.telegram.ownerId, notifyText({ ...c, ...c.app })).catch((e) => log('tg:', e.message));
    }
  }
}

/** Пакетная обработка накопившихся сообщений боту (режим GitHub Actions). */
export async function syncTelegram(store: Store, tg: Telegram | null) {
  if (!tg) return log('telegram: не настроен (TELEGRAM_BOT_TOKEN) — пропускаю');
  let offset = Number(store.getState('tg_offset') || 0);
  let n = 0;
  try {
    for (let i = 0; i < 10; i++) {
      const updates = await tg.getUpdates(offset, 0);
      if (!updates.length) break;
      for (const u of updates) {
        await handleUpdate(u, tg, store).catch((e) => log('tg update:', e.message));
        offset = u.update_id + 1;
        n++;
      }
      store.setState('tg_offset', offset);
    }
  } catch (e) {
    // 409 — бот прямо сейчас запущен локально (npm run dev) и сам забирает сообщения
    if (e instanceof TelegramError && e.code === 409) return log('telegram: бот уже работает в режиме dev — пропускаю');
    throw e;
  }
  log(`telegram: обработано обновлений ${n}`);
}

/** Отклики без ответа >10 дней → статус «Без ответа (>10 дней)». */
export function markStale(store: Store): Application[] {
  if (!config.autoStale) return [];
  const out: Application[] = [];
  for (const a of store.apps) {
    if (isWaiting(a.status) && a.date && daysBetween(a.date, store.today) > STALE_DAYS) {
      store.setStatus(a, 'Без ответа (>10 дней)');
      out.push(a);
    }
  }
  if (out.length) log(`без ответа >10 дней: ${out.length}`);
  return out;
}

/** Утренний дайджест — один раз в день, после DIGEST_HOUR по часовому поясу пользователя. */
export async function maybeDigest(store: Store, tg: Telegram | null, force = false) {
  if (!tg || !config.telegram.ownerId) return;
  const last = store.getState('last_digest');
  if (!force && (last === store.today || hourIn(config.tz) < config.digestHour)) return;
  const closed = store.apps.filter((a) => a.status === 'Без ответа (>10 дней)' && (!last || a.updated > last));
  await tg.send(config.telegram.ownerId, digestText(store.apps, store.today, closed));
  store.setState('last_digest', store.today);
  log('дайджест отправлен');
}

/** Один полный проход: то, что запускает GitHub Actions по расписанию. */
export async function syncOnce() {
  const store = await loadStore();
  let tg = telegram();
  // недоступный Telegram не должен ломать почту и таблицу — просто пропускаем бота в этот раз
  await syncTelegram(store, tg).catch((e) => {
    log('telegram: ошибка —', e.message);
    tg = null;
  });
  await syncEmail(store, tg).catch((e) => log('почта: ошибка —', e.message));
  markStale(store);
  await maybeDigest(store, tg).catch((e) => log('дайджест: ошибка —', e.message));
  const n = await store.flush();
  log(`таблица: обновлено строк ${n}`);
}
