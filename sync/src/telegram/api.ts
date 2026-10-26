import { request } from '../net';

/** Минимальный клиент Telegram Bot API на fetch — без сторонних библиотек. */
// Свой адрес API (например, прокси на Cloudflare Workers), если api.telegram.org недоступен из сети
const API = (process.env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/$/, '');

export interface TgChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export interface TgEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

export interface TgMessage {
  message_id: number;
  from?: { id: number; first_name?: string };
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  forward_origin?: { type: string; chat?: TgChat; message_id?: number; sender_user?: { first_name?: string } };
  forward_from_chat?: TgChat;
  forward_from_message_id?: number;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: { id: number }; data?: string; message?: TgMessage };
}

export type Button = { text: string; callback_data?: string; url?: string };
export type Keyboard = Button[][];

export class TelegramError extends Error {
  constructor(
    readonly code: number,
    msg: string,
  ) {
    super(msg);
  }
}

export class Telegram {
  constructor(private token: string) {}

  async call<T>(method: string, body: object = {}, timeoutMs = 20_000): Promise<T> {
    const res = await request(
      'Telegram',
      `${API}/bot${this.token}/${method}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      timeoutMs,
    );
    const raw = await res.text();
    let j: { ok: boolean; result: T; description?: string; error_code?: number };
    try {
      j = JSON.parse(raw);
    } catch {
      throw new TelegramError(res.status, `Telegram: вместо ответа API пришло «${raw.slice(0, 80)}» (HTTP ${res.status}) — похоже, мешает сеть/прокси`);
    }
    if (!j.ok) throw new TelegramError(j.error_code ?? res.status, `${method}: ${j.description}`);
    return j.result;
  }

  getUpdates(offset: number, timeout = 0) {
    return this.call<TgUpdate[]>(
      'getUpdates',
      { offset, timeout, allowed_updates: ['message', 'callback_query'] },
      (timeout + 10) * 1000,
    );
  }

  send(chatId: number | string, text: string, keyboard?: Keyboard) {
    return this.call<TgMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }

  edit(chatId: number, messageId: number, text: string, keyboard?: Keyboard) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }).catch((e) => {
      if (!String(e.message).includes('not modified')) throw e;
    });
  }

  answer(callbackId: string, text?: string) {
    // если бот обработал нажатие с опозданием (режим GitHub Actions), Telegram вернёт ошибку — это не страшно
    return this.call('answerCallbackQuery', { callback_query_id: callbackId, text }).catch(() => {});
  }

  me() {
    return this.call<{ username: string }>('getMe', {}, 15_000);
  }

  setCommands(commands: { command: string; description: string }[]) {
    return this.call('setMyCommands', { commands });
  }
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
