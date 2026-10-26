import type { Status } from '../../../core/statuses';
import { vacancyKey } from '../../../core/channel';

/**
 * Правила распознавания писем от hh.ru и Хабр Карьеры.
 * Формулировки писем площадки иногда меняют — если какое-то письмо распознаётся неверно,
 * запустите `npm run email:check`, посмотрите тему/текст и поправьте регулярки ниже.
 */

export type EmailKind = 'sent' | 'viewed' | 'message' | 'invite' | 'test' | 'offer' | 'reject' | 'skip';

export interface EmailInput {
  from: string;
  subject: string;
  text: string;
  html?: string;
  date: Date;
}

export interface EmailEvent {
  kind: EmailKind;
  platform: 'hh.ru' | 'Хабр Карьера';
  url: string;
  title: string;
  company: string;
  date: Date;
}

export const SENDERS = ['hh.ru', 'hh.kz', 'headhunter', 'habr.com', 'habr.ru'];

export const KIND_TO_STATUS: Record<Exclude<EmailKind, 'skip'>, Status> = {
  sent: 'Отправлено',
  viewed: 'Просмотрено',
  message: 'Просмотрено', // работодатель написал — как минимум открыл отклик
  invite: 'Приглашение',
  test: 'Тестовое задание',
  offer: 'Оффер',
  reject: 'Отказ',
};

// Порядок важен: первое совпадение побеждает.
const RULES: [Exclude<EmailKind, 'skip'>, RegExp][] = [
  ['reject', /отказ|к сожалению|не готовы (вас )?пригласить|не можем (вам )?предложить|отклонил|не подходит|приняли решение не|вакансия (уже )?закрыта|выбрали другого/],
  ['offer', /оффер|\boffer\b|предложение о работе|готовы предложить (вам )?(работу|должность|позицию)/],
  ['test', /тестов\S* задани|тестовое|test task/],
  ['invite', /приглаш|пригласил|приглашение на (интервью|собеседование)|собеседовани|интервью|созвон/],
  ['viewed', /просмотрел|посмотрел|просмотрен[оа]? (ваш(е|ему)? )?(отклик|резюме)|изучил ваш/],
  ['sent', /вы откликнулись|отклик (успешно )?(отправлен|доставлен)|ваш отклик (на вакансию )?(отправлен|доставлен|получен)|откликнулись на вакансию/],
  ['message', /нов(ое|ые) сообщени|написал[аи]? вам|сообщение от работодателя|ответил[аи]? на ваш отклик/],
];

// Рассылки и подборки — не про конкретный отклик.
const MARKETING =
  /подходящ\S* ваканси|новые вакансии|подборк|рекомендуем|могут заинтересовать|вакансии для вас|похожие ваканси|hh ?pro|скидк|акци|вебинар|опрос|дайджест|обновите резюме|поднимите резюме|подписк/;

function platformOf(from: string): EmailEvent['platform'] | null {
  const f = from.toLowerCase();
  if (/hh\.(ru|kz|by|uz)|headhunter/.test(f)) return 'hh.ru';
  if (/habr\.(com|ru)/.test(f)) return 'Хабр Карьера';
  return null;
}

/** Ссылки бывают завёрнуты в трекинговые редиректы — раскручиваем урл-энкодинг. */
function deepDecode(s: string): string {
  let cur = s;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
    } catch {
      break;
    }
  }
  return cur;
}

export function extractVacancyUrl(body: string): string {
  const t = deepDecode(body.replace(/&amp;/g, '&'));
  const hh = t.match(/hh\.(?:ru|kz|by|uz)\/vacancy\/(\d+)/i) ?? t.match(/vacancy[_-]?id[=:"\s]+(\d{5,})/i);
  if (hh) return `https://hh.ru/vacancy/${hh[1]}`;
  const habr = t.match(/career\.habr\.com\/vacancies\/(\d+)/i);
  if (habr) return `https://career.habr.com/vacancies/${habr[1]}`;
  return '';
}

const QUOTED = /[«"“„]([^»"”“]{2,120})[»"”“]/;

export function extractTitle(subject: string, text: string): string {
  const m =
    subject.match(new RegExp(`ваканси[июяй]\\s*${QUOTED.source}`, 'i')) ??
    text.match(new RegExp(`ваканси[июяй]\\s*${QUOTED.source}`, 'i')) ??
    subject.match(QUOTED);
  return m ? m[1].trim() : '';
}

export function extractCompany(subject: string, text: string): string {
  const src = `${subject}\n${text}`;
  const m =
    src.match(new RegExp(`(?:компани[яиюей]|работодател[ья])\\s*${QUOTED.source}`, 'i')) ??
    src.match(/(?:в компанию|в компании|от компании|компания)\s+([A-ZА-ЯЁ][\w\-.&«»" ]{1,60}?)(?=[,.!\n]| пригласил| отклонил| просмотрел| посмотрел|$)/u);
  return m ? m[1].replace(/[«»"]/g, '').trim() : '';
}

export function classify(email: EmailInput): EmailEvent | null {
  const platform = platformOf(email.from);
  if (!platform) return null;
  const subject = email.subject ?? '';
  const text = (email.text || (email.html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').slice(0, 4000);
  const hay = `${subject}\n${text}`.toLowerCase();

  const url = extractVacancyUrl(`${email.html ?? ''}\n${email.text ?? ''}`);
  const title = extractTitle(subject, text);
  const company = extractCompany(subject, text);

  // Рекламу отбрасываем, только если в ней нет признаков конкретного отклика.
  const marketing = MARKETING.test(subject.toLowerCase());
  let kind: EmailKind = 'skip';
  for (const [k, re] of RULES) {
    // тему проверяем первой — она точнее тела письма
    if (re.test(subject.toLowerCase())) {
      kind = k;
      break;
    }
  }
  // «Новое сообщение по вакансии» — тема ни о чём не говорит, смотрим, что внутри
  if (kind === 'message') {
    for (const [k, re] of RULES) {
      if (k === 'message' || k === 'viewed' || k === 'sent') continue;
      if (re.test(text.toLowerCase())) {
        kind = k;
        break;
      }
    }
  }
  if (kind === 'skip' && !marketing) {
    for (const [k, re] of RULES) {
      if (re.test(hay)) {
        kind = k;
        break;
      }
    }
  }
  if (marketing && kind !== 'invite' && kind !== 'reject' && kind !== 'offer') kind = 'skip';
  // без вакансии и названия не понять, к какому отклику относится письмо
  if (!url && !title) kind = 'skip';

  return { kind, platform, url, title, company, date: email.date };
}

export const sameVacancy = (a: string, b: string) => !!a && !!b && vacancyKey(a) === vacancyKey(b);
