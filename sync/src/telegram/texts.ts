import type { Application } from '../../../core/types';
import { formatRu, weekday } from '../../../core/dates';
import { computeAudit, GOALS, pct, type Audit, type Rate } from '../../../core/stats';
import { STATUSES, type Status } from '../../../core/statuses';
import { config } from '../config';
import { esc, type Keyboard } from './api';

const SHORT: Partial<Record<Status, string>> = {
  'Интервью 1 этап': 'Интервью 1',
  'Интервью 2 этап': 'Интервью 2',
  'Тестовое задание': 'Тестовое',
  'Без ответа (>10 дней)': 'Без ответа',
};

export function card(a: Application): string {
  const head = [a.company, a.title].filter(Boolean).map(esc).join(' · ') || 'Отклик';
  return [
    `<b>${head}</b>`,
    `${esc(a.channel)} · ${formatRu(a.date)}`,
    `Статус: <b>${a.status}</b>${a.letter ? ` · письмо: ${esc(a.letter)}` : ''}`,
    a.url ? esc(a.url) : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function cardKeyboard(a: Application): Keyboard {
  const rows: Keyboard = [];
  for (let i = 0; i < STATUSES.length; i += 2) {
    rows.push(
      STATUSES.slice(i, i + 2).map((s, j) => ({
        text: (s === a.status ? '● ' : '') + (SHORT[s] ?? s),
        callback_data: `s:${a.id}:${i + j}`,
      })),
    );
  }
  if (config.letters.length) {
    rows.push(
      config.letters.slice(0, 4).map((l, i) => ({
        text: (a.letter === l ? '● ' : '') + `✉ ${l}`,
        callback_data: `l:${a.id}:${i}`,
      })),
    );
  }
  if (/^https?:\/\//.test(a.url)) rows.push([{ text: 'Открыть вакансию', url: a.url }]);
  return rows;
}

const rateLine = (label: string, r: Rate) =>
  `${label}: <b>${pct(r.value)}</b> (${r.num}/${r.den}, норма ${Math.round(r.norm[0] * 100)}–${Math.round(r.norm[1] * 100)}%) — ${r.verdict}`;

export function auditText(a: Audit, title: string): string {
  const lines = [
    `<b>${title}</b> (${formatRu(a.period.from)}–${formatRu(a.period.to)})`,
    `Откликов: <b>${a.total}</b> · приглашений: ${a.invited} · интервью: ${a.interviews} · офферов: ${a.offers}`,
    '',
    rateLine('Отклик → приглашение', a.conv.invite),
    rateLine('Приглашение → интервью', a.conv.interview),
    rateLine('Интервью → оффер', a.conv.offer),
  ];
  if (a.byChannel.length) {
    lines.push('', '<b>Каналы</b>');
    for (const c of a.byChannel.slice(0, 6)) lines.push(`${esc(c.name)}: ${c.total} откл., ${c.invited} приглаш. (${pct(c.rate)})`);
  }
  if (a.byLetter.length > 1) {
    lines.push('', '<b>Письма (A/B)</b>');
    for (const c of a.byLetter) lines.push(`${esc(c.name)}: ${c.total} откл., ${c.invited} приглаш. (${pct(c.rate)})`);
  }
  if (a.stale.length) lines.push('', `Без ответа больше 10 дней: <b>${a.stale.length}</b> — /stale`);
  return lines.join('\n');
}

export function digestText(apps: Application[], today: string, autoClosed: Application[]): string {
  const week = computeAudit(apps, { today, days: 7 });
  const yesterday = week.daily.at(-2)?.count ?? 0;
  const lines = [
    '<b>Доброе утро!</b>',
    `Вчера откликов: <b>${yesterday}</b> (цель ${GOALS.dayMin}–${GOALS.dayMax})`,
    `За 7 дней: <b>${week.last7}</b> из ${GOALS.weekMin}–${GOALS.weekMax} · серия: ${week.streak} дн.`,
    rateLine('Отклик → приглашение', week.conv.invite),
  ];
  if (week.bestChannel) lines.push(`Лучший канал недели: ${esc(week.bestChannel)}`);
  if (autoClosed.length) {
    lines.push('', `<b>Помечены «Без ответа (>10 дней)»: ${autoClosed.length}</b>`);
    for (const a of autoClosed.slice(0, 5)) lines.push(`• ${esc(a.company || a.title || a.url)}`);
    lines.push('Можно написать follow-up — шаблон: /followup');
  }
  // по понедельникам — полный недельный аудит, как просит куратор
  if (weekday(today) === 1) lines.push('', auditText(week, 'Недельный аудит'));
  if (config.dashboardUrl) lines.push('', `Дашборд: ${config.dashboardUrl}`);
  return lines.join('\n');
}

export const HELP = `<b>Трекер откликов</b>

Перешлите сюда пост с вакансией из канала или пришлите ссылку — я добавлю отклик в таблицу со статусом «Отправлено». Статус и вариант письма меняются кнопками под карточкой.

Ручной формат: <code>ссылка | Компания | Вакансия | письмо</code>

Письма от hh.ru и Хабр Карьеры (приглашения, отказы, просмотры) подтягиваются автоматически.

/today — сколько откликов сегодня
/stats — аудит за 7 дней (/stats 30, /stats all)
/stale — висят без ответа больше 10 дней
/last — последние отклики
/followup — шаблон follow-up письма
/dashboard — ссылка на дашборд`;

export const FOLLOWUP = `Шаблон follow-up (через 7–10 дней без ответа):

<code>Добрый день! Около недели назад откликалась на вакансию «НАЗВАНИЕ». Хотела уточнить, актуальна ли она и успели ли вы посмотреть мой отклик? Если удобно, могу коротко рассказать о релевантном опыте: [1 факт под вакансию]. Спасибо!</code>`;
