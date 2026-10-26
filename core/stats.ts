import type { Application } from './types';
import { channelGroup } from './channel';
import { addDays, daysBetween, isWorkday } from './dates';
import { higherStage, isWaiting, reachedInterview, reachedInvite, reachedOffer, STATUSES, type Status } from './statuses';

/** Нормы из блока 6 инструкции куратора. */
export const NORMS = {
  invite: [0.1, 0.2],
  interview: [0.7, 0.9],
  offer: [0.2, 0.3],
} as const;

export const GOALS = { dayMin: 5, dayMax: 7, weekMin: 25, weekMax: 30 } as const;
export const STALE_DAYS = 10;

export type Verdict = 'нет данных' | 'ниже нормы' | 'в норме' | 'выше нормы';

export interface Rate {
  value: number | null; // 0..1
  num: number;
  den: number;
  norm: readonly [number, number];
  verdict: Verdict;
}

export interface GroupRow {
  name: string;
  total: number;
  invited: number;
  rate: number | null;
}

export interface Audit {
  period: { from: string; to: string };
  total: number;
  invited: number;
  interviews: number;
  offers: number;
  rejected: number;
  conv: { invite: Rate; interview: Rate; offer: Rate };
  byChannel: GroupRow[];
  byLetter: GroupRow[];
  byStatus: { status: Status; count: number }[];
  stale: (Application & { days: number })[];
  daily: { date: string; count: number }[];
  last7: number;
  today: number;
  streak: number;
  bestChannel: string | null;
}

function rate(num: number, den: number, norm: readonly [number, number]): Rate {
  if (!den) return { value: null, num, den, norm, verdict: 'нет данных' };
  const v = num / den;
  const verdict: Verdict = v < norm[0] ? 'ниже нормы' : v > norm[1] ? 'выше нормы' : 'в норме';
  return { value: v, num, den, norm, verdict };
}

const stageOf = (a: Application) => higherStage(a.maxStage, a.status);

function group(apps: Application[], key: (a: Application) => string): GroupRow[] {
  const m = new Map<string, GroupRow>();
  for (const a of apps) {
    const name = key(a);
    if (!name) continue;
    const g = m.get(name) ?? { name, total: 0, invited: 0, rate: null };
    g.total++;
    if (reachedInvite(stageOf(a))) g.invited++;
    m.set(name, g);
  }
  return [...m.values()]
    .map((g) => ({ ...g, rate: g.total ? g.invited / g.total : null }))
    .sort((a, b) => b.invited - a.invited || b.total - a.total);
}

/** Серия рабочих дней подряд, когда был хотя бы один отклик. Выходные серию не рвут. */
export function streak(dates: Set<string>, today: string): number {
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    if (dates.has(d)) n++;
    else if (isWorkday(d)) break;
  }
  return n;
}

export function computeAudit(
  all: Application[],
  opts: { today: string; days?: number | null; dailyWindow?: number },
): Audit {
  const { today } = opts;
  const from = opts.days ? addDays(today, -(opts.days - 1)) : all.reduce((m, a) => (a.date && a.date < m ? a.date : m), today);
  const apps = all.filter((a) => a.date && a.date >= from && a.date <= today);

  const invited = apps.filter((a) => reachedInvite(stageOf(a)));
  const interviews = apps.filter((a) => reachedInterview(stageOf(a)));
  const offers = apps.filter((a) => reachedOffer(stageOf(a)));

  const byStatus = STATUSES.map((status) => ({ status, count: apps.filter((a) => a.status === status).length })).filter(
    (x) => x.count > 0,
  );

  const stale = all
    .filter(
      (a) =>
        (isWaiting(a.status) || a.status === 'Без ответа (>10 дней)') && a.date && daysBetween(a.date, today) > STALE_DAYS,
    )
    .map((a) => ({ ...a, days: daysBetween(a.date, today) }))
    .sort((a, b) => b.days - a.days);

  const counts = new Map<string, number>();
  for (const a of all) if (a.date) counts.set(a.date, (counts.get(a.date) ?? 0) + 1);
  const window = opts.dailyWindow ?? 14;
  const daily = Array.from({ length: window }, (_, i) => {
    const date = addDays(today, i - window + 1);
    return { date, count: counts.get(date) ?? 0 };
  });

  const byChannel = group(apps, (a) => channelGroup(a.channel));
  const best = byChannel.find((c) => c.invited > 0);

  return {
    period: { from, to: today },
    total: apps.length,
    invited: invited.length,
    interviews: interviews.length,
    offers: offers.length,
    rejected: apps.filter((a) => a.status === 'Отказ').length,
    conv: {
      invite: rate(invited.length, apps.length, NORMS.invite),
      interview: rate(interviews.length, invited.length, NORMS.interview),
      offer: rate(offers.length, interviews.length, NORMS.offer),
    },
    byChannel,
    byLetter: group(apps, (a) => a.letter.trim()),
    byStatus,
    stale,
    daily,
    last7: daily.slice(-7).reduce((s, d) => s + d.count, 0),
    today: counts.get(today) ?? 0,
    streak: streak(new Set(counts.keys()), today),
    bestChannel: best ? best.name : null,
  };
}

export const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
