import { readFileSync } from 'node:fs';

const env = (k: string, def = '') => (process.env[k] ?? def).trim();

function serviceAccount(): { client_email: string; private_key: string } | null {
  const raw = env('GOOGLE_SERVICE_ACCOUNT_JSON') || (env('GOOGLE_SERVICE_ACCOUNT_FILE') && readFileSync(env('GOOGLE_SERVICE_ACCOUNT_FILE'), 'utf8'));
  if (!raw) return null;
  const j = JSON.parse(raw);
  return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, '\n') };
}

export const config = {
  tz: env('TZ_NAME', 'Asia/Yekaterinburg'),
  google: serviceAccount(),
  spreadsheetId: env('SPREADSHEET_ID'),
  sheet: env('SHEET_NAME', 'Отклики'),
  auditSheet: 'Аудит',
  stateSheet: '_state',

  imap: {
    host: env('IMAP_HOST', 'imap.gmail.com'),
    port: Number(env('IMAP_PORT', '993')),
    user: env('IMAP_USER'),
    pass: env('IMAP_PASSWORD'),
    mailbox: env('IMAP_MAILBOX', 'INBOX'),
    firstRunDays: Number(env('EMAIL_FIRST_RUN_DAYS', '14')),
  },

  telegram: {
    token: env('TELEGRAM_BOT_TOKEN'),
    ownerId: env('TELEGRAM_OWNER_ID'),
  },

  digestHour: Number(env('DIGEST_HOUR', '9')),
  autoStale: env('AUTO_STALE', 'true') !== 'false',
  letters: env('LETTER_VARIANTS', 'real-time,legacy,общее')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  dashboardUrl: env('DASHBOARD_URL'),
};

export const hasEmail = () => Boolean(config.imap.user && config.imap.pass);
export const hasTelegram = () => Boolean(config.telegram.token);

export function requireSheets() {
  if (!config.google || !config.spreadsheetId) {
    throw new Error(
      'Не настроена Google Таблица: нужны GOOGLE_SERVICE_ACCOUNT_JSON (или _FILE) и SPREADSHEET_ID. См. README, шаг 1.',
    );
  }
  return { sa: config.google, id: config.spreadsheetId };
}
