import { describe, expect, it } from 'vitest';
import { classify } from '../src/email/rules';
import { parseVacancyMessage } from '../src/telegram/parse';

/*
 * Примеры писем составлены по типичным формулировкам hh.ru и Хабр Карьеры.
 * Когда появятся настоящие письма — добавьте их сюда (тему + кусок текста), чтобы правила не ломались.
 */
const mail = (subject: string, text: string, from = 'hh.ru <noreply@hh.ru>') => ({
  from,
  subject,
  text,
  html: `<a href="https://click.hh.ru/redirect?url=https%3A%2F%2Fhh.ru%2Fvacancy%2F138140978%3Ffrom%3Dmail">Вакансия</a>`,
  date: new Date('2026-10-27T10:00:00Z'),
});

describe('письма hh.ru', () => {
  it('приглашение', () => {
    const e = classify(mail('Приглашение на вакансию «Frontend-разработчик React»', 'Компания «АФЛТ-Системс» пригласила вас на собеседование'));
    expect(e?.kind).toBe('invite');
    expect(e?.url).toBe('https://hh.ru/vacancy/138140978');
    expect(e?.title).toBe('Frontend-разработчик React');
    expect(e?.company).toBe('АФЛТ-Системс');
  });
  it('отказ (даже если в тексте есть слово «собеседование»)', () => {
    const e = classify(mail('Ответ по вакансии «Middle frontend разработчик»', 'К сожалению, работодатель не готов пригласить вас на собеседование'));
    expect(e?.kind).toBe('reject');
  });
  it('просмотр резюме', () => {
    expect(classify(mail('Работодатель посмотрел ваш отклик', 'на вакансию «Frontend-разработчик»'))?.kind).toBe('viewed');
  });
  it('отклик отправлен', () => {
    expect(classify(mail('Вы откликнулись на вакансию «Frontend Developer (AI-first)»', ''))?.kind).toBe('sent');
  });
  it('тестовое задание', () => {
    expect(classify(mail('Новое сообщение по вакансии «Frontend-разработчик»', 'Отправляем тестовое задание, срок — 5 дней'))?.kind).toBe('test');
  });
  it('рассылки игнорируются', () => {
    expect(classify(mail('Подходящие вакансии для вас', 'Frontend-разработчик в Яндекс'))?.kind).toBe('skip');
  });
  it('чужие отправители не трогаются', () => {
    expect(classify(mail('Приглашение', 'x', 'shop@ozon.ru'))).toBeNull();
  });
});

describe('письма Хабр Карьеры', () => {
  it('приглашение с ссылкой на вакансию', () => {
    const e = classify({
      from: 'Хабр Карьера <career@habr.com>',
      subject: 'Вас пригласили на вакансию «React разработчик»',
      text: 'Смотрите: https://career.habr.com/vacancies/1000060894',
      date: new Date(),
    });
    expect(e?.kind).toBe('invite');
    expect(e?.platform).toBe('Хабр Карьера');
    expect(e?.url).toBe('https://career.habr.com/vacancies/1000060894');
  });
});

describe('сообщения боту', () => {
  it('пересланный пост из канала без ссылки', () => {
    const v = parseVacancyMessage({
      message_id: 1,
      chat: { id: 1, type: 'private' },
      date: 0,
      text: '🔥 Frontend-разработчик (React)\nКомпания: VOID\nУдалёнка, 150–200к',
      forward_origin: { type: 'channel', chat: { id: -100, type: 'channel', username: 'frontend_jobs_vakansii' }, message_id: 777 },
    });
    expect(v).toMatchObject({
      url: 'https://t.me/frontend_jobs_vakansii/777',
      channel: 'Telegram: @frontend_jobs_vakansii',
      company: 'VOID',
      title: 'Frontend-разработчик (React)',
    });
  });
  it('ссылка на hh в тексте поста важнее ссылки на пост', () => {
    const v = parseVacancyMessage({
      message_id: 1,
      chat: { id: 1, type: 'private' },
      date: 0,
      text: 'Senior Frontend developer\nОткликаться: https://hh.ru/vacancy/138483294',
      forward_origin: { type: 'channel', chat: { id: -100, type: 'channel', username: 'fordev' }, message_id: 5 },
    });
    expect(v?.url).toBe('https://hh.ru/vacancy/138483294');
    expect(v?.channel).toBe('Telegram: @fordev');
  });
  it('ручной формат через |', () => {
    const v = parseVacancyMessage(
      { message_id: 1, chat: { id: 1, type: 'private' }, date: 0, text: 'https://void.ru/jobs/front | VOID | Frontend-разработчик | real-time' },
      ['real-time', 'legacy'],
    );
    expect(v).toMatchObject({ company: 'VOID', title: 'Frontend-разработчик', letter: 'real-time', channel: 'Сайт компании' });
  });
  it('обычный текст — не вакансия', () => {
    expect(parseVacancyMessage({ message_id: 1, chat: { id: 1, type: 'private' }, date: 0, text: 'привет' })).toBeNull();
  });
});
