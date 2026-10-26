import { config, hasEmail } from './config';
import { setup } from './setup';
import { check } from './check';
import { loadStore, maybeDigest, markStale, sheets, syncEmail, syncOnce, telegram } from './jobs';
import { fetchJobEmails } from './email/imap';
import { classify } from './email/rules';
import { handleUpdate, COMMANDS } from './telegram/handlers';

const cmd = process.argv[2];

async function main() {
  switch (cmd) {
    case 'setup': {
      const r = await setup(sheets());
      console.log('Таблица готова.', r.added.length ? `Созданы листы: ${r.added.join(', ')}.` : '');
      const tg = telegram();
      if (tg) await tg.setCommands(COMMANDS).then(() => console.log('Команды бота зарегистрированы.'));
      return;
    }

    case 'check':
      return check();

    case 'sync':
      return syncOnce();

    case 'digest': {
      const store = await loadStore();
      await maybeDigest(store, telegram(), true);
      await store.flush();
      return;
    }

    case 'email:check': {
      // Ничего не пишет — только показывает, как распознаются последние письма. Для настройки правил.
      if (!hasEmail()) throw new Error('Заполните IMAP_USER и IMAP_PASSWORD в .env');
      const res = await fetchJobEmails({ lastUid: 0, uidValidity: '', limit: 40 });
      for (const e of res.emails) {
        const ev = classify(e);
        console.log(`\n[${ev?.kind ?? '—'}] ${e.subject}\n  от: ${e.from}\n  вакансия: ${ev?.title || '—'} | ${ev?.company || '—'} | ${ev?.url || '—'}`);
      }
      console.log(`\nВсего писем от hh/Хабра за ${config.imap.firstRunDays} дн.: ${res.emails.length}`);
      return;
    }

    case 'dev': {
      // Локальный режим: бот отвечает мгновенно (long polling), почта проверяется каждые 10 минут.
      const tg = telegram();
      if (!tg) throw new Error('Нужен TELEGRAM_BOT_TOKEN в .env');
      console.log('Бот запущен. Ctrl+C — остановить.');
      let offset = Number((await loadStore()).getState('tg_offset') || 0);
      let lastMail = 0;
      for (;;) {
        try {
          if (Date.now() - lastMail > 10 * 60_000) {
            const store = await loadStore();
            await syncEmail(store, tg);
            markStale(store);
            await maybeDigest(store, tg);
            await store.flush();
            lastMail = Date.now();
          }
          const updates = await tg.getUpdates(offset, 25);
          if (!updates.length) continue;
          const store = await loadStore(); // свежие данные: таблицу могли поправить руками
          for (const u of updates) {
            await handleUpdate(u, tg, store).catch((e) => console.error('update:', e.message));
            offset = u.update_id + 1;
          }
          store.setState('tg_offset', offset);
          await store.flush();
        } catch (e) {
          console.error((e as Error).message);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }

    default:
      console.log(`Команды:
  npm run check        — проверить подключения к Google, почте и Telegram
  npm run setup        — создать и оформить листы в Google Таблице
  npm run sync         — один проход: бот + почта + дайджест (это запускает GitHub Actions)
  npm run dev          — бот в реальном времени на своём компьютере
  npm run email:check  — проверить, как распознаются письма (ничего не пишет)
  npm run digest       — отправить дайджест прямо сейчас`);
  }
}

main().catch((e) => {
  console.error('Ошибка:', e instanceof Error ? e.message : e);
  process.exit(1);
});
