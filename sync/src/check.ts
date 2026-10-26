import { ImapFlow } from 'imapflow';
import { config, hasEmail, hasTelegram } from './config';
import { sheets, telegram } from './jobs';

/** Проверяет по отдельности каждое подключение и пишет, что именно не работает. */
export async function check() {
  const step = async (name: string, enabled: boolean, fn: () => Promise<string>) => {
    if (!enabled) return console.log(`–  ${name}: не настроено в .env`);
    const t = Date.now();
    try {
      const info = await fn();
      console.log(`✓  ${name}: ${info} (${((Date.now() - t) / 1000).toFixed(1)} с)`);
    } catch (e) {
      console.log(`✗  ${name}: ${(e as Error).message}`);
    }
  };

  await step('Google Таблица', Boolean(config.google && config.spreadsheetId), async () => {
    const m = await sheets().meta();
    return `листы: ${m.sheets.map((s) => s.properties.title).join(', ')}`;
  });

  await step('Почта (IMAP)', hasEmail(), async () => {
    const c = new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: true,
      auth: { user: config.imap.user, pass: config.imap.pass },
      logger: false,
    });
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${config.imap.host} не ответил за 20 с`)), 20_000));
    await Promise.race([c.connect(), timeout]);
    const box = await c.mailboxOpen(config.imap.mailbox, { readOnly: true });
    await c.logout();
    return `${config.imap.user}, писем в ${config.imap.mailbox}: ${box.exists}`;
  });

  await step('Telegram-бот', hasTelegram(), async () => {
    const me = await telegram()!.me();
    return `@${me.username}${config.telegram.ownerId ? '' : ' — TELEGRAM_OWNER_ID ещё не задан'}`;
  });
}
