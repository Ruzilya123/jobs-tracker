/** Достаёт первую ссылку из текста (с протоколом или без). */
export function extractUrls(text: string): string[] {
  const re = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-zа-я]{2,}(?:\/[^\s<>()"'«»]*)?)/giu;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    let u = m[1].replace(/[.,;:!?)]+$/, '');
    if (!/^https?:\/\//i.test(u)) {
      // «hh.ru/vacancy/1» — ссылка, а «т.ч.» — нет
      if (!u.includes('/')) continue;
      u = 'https://' + u;
    }
    out.push(u);
  }
  return out;
}

/** Ключ вакансии для поиска дублей: одна и та же вакансия по разным ссылкам. */
export function vacancyKey(url: string): string {
  if (!url) return '';
  const u = url.trim();
  const hh = u.match(/(?:^|[/.])hh\.(?:ru|kz|by|uz)\/vacancy\/(\d+)/i) ?? u.match(/[?&]vacancyId=(\d+)/i);
  if (hh) return `hh:${hh[1]}`;
  const habr = u.match(/career\.habr\.com\/vacancies\/(\d+)/i);
  if (habr) return `habr:${habr[1]}`;
  const tg = u.match(/t\.me\/(?:s\/)?([\w\d_]+)\/(\d+)/i);
  if (tg) return `tg:${tg[1].toLowerCase()}/${tg[2]}`;
  return u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
}

/** Человеческое название канала по ссылке (и/или по каналу, из которого переслан пост). */
export function detectChannel(url: string, forwardedFrom?: string): string {
  if (forwardedFrom) return `Telegram: ${forwardedFrom}`;
  const u = url.toLowerCase();
  if (/(^|[/.])hh\.(ru|kz|by|uz)\//.test(u)) return 'hh.ru';
  if (u.includes('career.habr.com')) return 'Хабр Карьера';
  if (u.includes('getmatch.ru')) return 'Getmatch';
  if (u.includes('geekjob.ru')) return 'GeekJob';
  if (u.includes('superjob.ru')) return 'SuperJob';
  if (u.includes('avito.ru')) return 'Авито Работа';
  const tg = u.match(/t\.me\/(?:s\/)?([\w\d_]+)/);
  if (tg) return `Telegram: @${tg[1]}`;
  if (u.includes('vk.com')) return 'VK';
  if (u.includes('linkedin.com')) return 'LinkedIn';
  return u ? 'Сайт компании' : 'Другое';
}

/** Канал без детализации — для группировки в аудите («Telegram: @a» и «Telegram: @b» → Telegram). */
export function channelGroup(channel: string): string {
  if (channel.startsWith('Telegram')) return 'Telegram';
  return channel || 'Другое';
}
