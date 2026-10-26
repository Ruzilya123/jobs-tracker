import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from '../config';
import { SENDERS, type EmailInput } from './rules';

export interface FetchedEmail extends EmailInput {
  uid: number;
}

/**
 * Забирает письма от hh.ru / Хабра, пришедшие после последнего обработанного UID.
 * Письма не помечаются прочитанными и никак не меняются.
 */
export async function fetchJobEmails(opts: { lastUid: number; uidValidity: string; limit?: number }) {
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: true,
    auth: { user: config.imap.user, pass: config.imap.pass },
    logger: false,
  });
  await client.connect();
  const out: FetchedEmail[] = [];
  let uidValidity = '';
  let maxUid = opts.lastUid;
  try {
    const box = await client.mailboxOpen(config.imap.mailbox, { readOnly: true });
    uidValidity = String(box.uidValidity);
    // UIDVALIDITY сменился (или первый запуск) — начинаем с писем за последние N дней
    const fresh = uidValidity !== opts.uidValidity || !opts.lastUid;
    const since = new Date(Date.now() - config.imap.firstRunDays * 86_400_000);

    const uids = new Set<number>();
    for (const from of SENDERS) {
      const found = await client.search(fresh ? { from, since } : { from, uid: `${opts.lastUid + 1}:*` }, { uid: true });
      for (const u of found || []) if (fresh || u > opts.lastUid) uids.add(u);
    }
    const list = [...uids].sort((a, b) => a - b).slice(0, opts.limit ?? 200);
    if (list.length) {
      for await (const msg of client.fetch(list, { uid: true, source: true }, { uid: true })) {
        if (!msg.source) continue;
        const p = await simpleParser(msg.source);
        out.push({
          uid: msg.uid,
          from: p.from?.text ?? '',
          subject: p.subject ?? '',
          text: p.text ?? '',
          html: typeof p.html === 'string' ? p.html : '',
          date: p.date ?? new Date(),
        });
        maxUid = Math.max(maxUid, msg.uid);
      }
    }
    if (fresh && !list.length) {
      // писем нет — запоминаем текущую позицию, чтобы в следующий раз не сканировать заново
      maxUid = Math.max(0, (box.uidNext ?? 1) - 1);
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { emails: out.sort((a, b) => a.uid - b.uid), uidValidity, lastUid: maxUid };
}
