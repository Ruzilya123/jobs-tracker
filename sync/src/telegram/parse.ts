import { detectChannel, extractUrls } from '../../../core/channel';
import type { TgMessage } from './api';

export interface ParsedVacancy {
  url: string;
  channel: string;
  title: string;
  company: string;
  letter: string;
}

const JOB_SITES = /hh\.(ru|kz|by|uz)\/vacancy|career\.habr\.com\/vacancies|getmatch\.ru|geekjob\.ru|superjob\.ru|avito\.ru|\/(career|careers|jobs|vacancies|vacancy|job)\b/i;

const cleanLine = (s: string) =>
  s
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\p{Extended_Pictographic}‍️]/gu, '')
    .replace(/^[#*\-•—\s]+/, '')
    .replace(/[*_`]/g, '')
    .trim();

/**
 * Понимает три формата:
 *  1) пересланный пост из канала с вакансией;
 *  2) просто ссылка (+ любой текст);
 *  3) ручной ввод «ссылка | Компания | Вакансия | вариант письма».
 */
export function parseVacancyMessage(msg: TgMessage, letters: string[] = []): ParsedVacancy | null {
  const text = msg.text ?? msg.caption ?? '';
  const entities = msg.entities ?? msg.caption_entities ?? [];
  const urls = [
    ...entities.filter((e) => e.type === 'text_link' && e.url).map((e) => e.url!),
    ...extractUrls(text),
  ];

  const origin = msg.forward_origin;
  const fwdChat = origin?.type === 'channel' ? origin.chat : msg.forward_from_chat;
  const fwdId = origin?.message_id ?? msg.forward_from_message_id;
  const fwdName = fwdChat ? (fwdChat.username ? `@${fwdChat.username}` : fwdChat.title ?? 'канал') : '';
  const postUrl = fwdChat?.username && fwdId ? `https://t.me/${fwdChat.username}/${fwdId}` : '';

  // ручной формат через «|»
  if (text.includes('|') && urls.length) {
    const [u, company = '', title = '', letter = ''] = text.split('|').map((s) => s.trim());
    const url = extractUrls(u)[0] ?? urls[0];
    return { url, channel: detectChannel(url, fwdName || undefined), company, title, letter: matchLetter(letter, letters) };
  }

  const url = urls.find((u) => JOB_SITES.test(u)) || postUrl || urls[0] || '';
  if (!url && !fwdChat) return null;

  const lines = text.split('\n').map(cleanLine).filter(Boolean);
  const companyLine = text.match(/(?:компания|company|работодатель)\s*[:—–-]\s*([^\n]{2,80})/i);
  const companyIn = text.match(/(?:в компанию|в команду|в компании)\s+([«"]?[A-ZА-ЯЁ][^\n,.!]{1,50})/u);
  const titleLine =
    text.match(/(?:ваканси[яи]|позиция|должность|position|ищем|требуется)\s*[:—–-]?\s*([^\n]{3,100})/i)?.[1] ??
    lines.find((l) => /developer|разработчик|engineer|frontend|front-end|react|инженер|программист/i.test(l)) ??
    lines[0] ??
    '';

  return {
    url,
    channel: detectChannel(url, fwdName || undefined),
    company: cleanLine(companyLine?.[1] ?? companyIn?.[1] ?? '').replace(/[«»"]/g, ''),
    title: cleanLine(titleLine).slice(0, 100),
    letter: '',
  };
}

function matchLetter(raw: string, letters: string[]): string {
  if (!raw) return '';
  return letters.find((l) => l.toLowerCase() === raw.toLowerCase()) ?? raw;
}
