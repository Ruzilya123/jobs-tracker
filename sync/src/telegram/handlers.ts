import { computeAudit, GOALS } from '../../../core/stats';
import { STATUSES } from '../../../core/statuses';
import { config } from '../config';
import type { Store } from '../store';
import { esc, type Telegram, type TgUpdate } from './api';
import { parseVacancyMessage } from './parse';
import { auditText, card, cardKeyboard, FOLLOWUP, HELP } from './texts';

export const COMMANDS = [
  { command: 'today', description: 'Откликов сегодня' },
  { command: 'stats', description: 'Аудит за 7 дней' },
  { command: 'stale', description: 'Без ответа > 10 дней' },
  { command: 'last', description: 'Последние отклики' },
  { command: 'followup', description: 'Шаблон follow-up' },
  { command: 'dashboard', description: 'Ссылка на дашборд' },
  { command: 'help', description: 'Как пользоваться' },
];

/** Обрабатывает одно обновление. Возвращает true, если таблица изменилась. */
export async function handleUpdate(u: TgUpdate, tg: Telegram, store: Store): Promise<boolean> {
  const owner = config.telegram.ownerId;

  if (u.callback_query) {
    const q = u.callback_query;
    if (String(q.from.id) !== owner) return tg.answer(q.id, 'Это не ваш трекер').then(() => false);
    const [kind, id, idx] = (q.data ?? '').split(':');
    const app = store.get(id);
    if (!app) return tg.answer(q.id, 'Отклик не найден в таблице').then(() => false);
    let changed = false;
    if (kind === 's' && STATUSES[+idx]) changed = store.setStatus(app, STATUSES[+idx]);
    if (kind === 'l' && config.letters[+idx]) {
      const letter = app.letter === config.letters[+idx] ? '' : config.letters[+idx];
      store.patch(app, { letter });
      changed = true;
    }
    await tg.answer(q.id, changed ? 'Сохранено' : undefined);
    if (q.message) await tg.edit(q.message.chat.id, q.message.message_id, card(app), cardKeyboard(app));
    return changed;
  }

  const msg = u.message;
  if (!msg) return false;
  const chat = msg.chat.id;

  if (!owner) {
    await tg.send(chat, `Ваш Telegram ID: <code>${msg.from?.id}</code>\nДобавьте его в TELEGRAM_OWNER_ID (см. README), и бот начнёт работать.`);
    return false;
  }
  if (String(msg.from?.id) !== owner) return false; // чужим не отвечаем вообще

  const text = (msg.text ?? '').trim();
  const [cmd, arg] = text.startsWith('/') ? text.slice(1).split(/\s+/) : ['', ''];
  const today = store.today;

  switch (cmd.replace(/@.*/, '')) {
    case 'start':
    case 'help':
      await tg.send(chat, HELP);
      return false;
    case 'today': {
      const a = computeAudit(store.apps, { today, days: 7 });
      const left = Math.max(0, GOALS.dayMin - a.today);
      await tg.send(
        chat,
        `Сегодня: <b>${a.today}</b> из ${GOALS.dayMin}–${GOALS.dayMax}${left ? ` — ещё ${left}` : ' — цель дня выполнена'}\nЗа 7 дней: ${a.last7} · серия: ${a.streak} дн.`,
      );
      return false;
    }
    case 'stats': {
      const days = arg === 'all' ? null : Number(arg) || 7;
      const a = computeAudit(store.apps, { today, days });
      await tg.send(chat, auditText(a, days ? `Аудит за ${days} дн.` : 'Аудит за всё время'));
      return false;
    }
    case 'stale': {
      const a = computeAudit(store.apps, { today, days: null });
      if (!a.stale.length) return tg.send(chat, 'Зависших откликов нет').then(() => false);
      await tg.send(chat, `Без ответа больше 10 дней: <b>${a.stale.length}</b>. Первые 5:`);
      for (const s of a.stale.slice(0, 5)) await tg.send(chat, `${card(s)}\n<i>${s.days} дн. без ответа</i>`, cardKeyboard(s));
      return false;
    }
    case 'last': {
      for (const s of store.apps.slice(-5)) await tg.send(chat, card(s), cardKeyboard(s));
      return false;
    }
    case 'followup':
      await tg.send(chat, FOLLOWUP);
      return false;
    case 'dashboard':
      await tg.send(chat, config.dashboardUrl || 'Ссылка на дашборд не задана (DASHBOARD_URL).');
      return false;
  }

  const v = parseVacancyMessage(msg, config.letters);
  if (!v) {
    await tg.send(chat, 'Не нашла ссылку на вакансию. Перешлите пост из канала или пришлите ссылку. /help');
    return false;
  }
  const dup = v.url && store.findByUrl(v.url);
  if (dup) {
    await tg.send(chat, `Этот отклик уже есть в таблице:\n\n${card(dup)}`, cardKeyboard(dup));
    return false;
  }
  const app = store.add({ ...v, source: 'бот' });
  await tg.send(
    chat,
    `Добавила в таблицу ✓\n\n${card(app)}${!app.company ? '\n\n<i>Компанию не распознала — можно дописать в таблице.</i>' : ''}`,
    cardKeyboard(app),
  );
  return true;
}

export const notifyText = (n: { status: string; created: boolean; company: string; title: string; channel: string }) =>
  `📩 ${esc(n.channel)}: <b>${n.status}</b>${n.created ? ' (новый отклик)' : ''}\n${esc([n.company, n.title].filter(Boolean).join(' · '))}`;
