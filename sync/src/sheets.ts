import { createSign } from 'node:crypto';
import { request } from './net';

/**
 * Минимальный клиент Google Sheets API v4 на fetch.
 * Без пакета googleapis (он весит ~100 МБ) — авторизация сервисным аккаунтом через подписанный JWT.
 */
export class SheetsClient {
  private token = '';
  private tokenExp = 0;

  constructor(
    private sa: { client_email: string; private_key: string },
    readonly spreadsheetId: string,
  ) {}

  private async auth(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && now < this.tokenExp - 60) return this.token;
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: this.sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(this.sa.private_key).toString('base64url');
    const res = await request('Google', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${sig}`,
      }),
    });
    if (!res.ok) throw new Error(`Google auth: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = j.access_token;
    this.tokenExp = now + j.expires_in;
    return this.token;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}${path}`;
    for (let attempt = 0; ; attempt++) {
      const res = await request('Google Sheets', url, {
        ...init,
        headers: { authorization: `Bearer ${await this.auth()}`, 'content-type': 'application/json', ...init.headers },
      });
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 403)
          throw new Error(`Нет доступа к таблице (403). Откройте таблице доступ «Редактор» для ${this.sa.client_email}. ${body}`);
        throw new Error(`Sheets API ${res.status}: ${body}`);
      }
      return (await res.json()) as T;
    }
  }

  static range(sheet: string, a1 = '') {
    return encodeURIComponent(`'${sheet.replace(/'/g, "''")}'${a1 ? '!' + a1 : ''}`);
  }

  async meta() {
    return this.call<{ sheets: { properties: { sheetId: number; title: string; hidden?: boolean } }[] }>(
      '?fields=sheets.properties',
    );
  }

  async get(sheet: string, a1: string): Promise<string[][]> {
    const r = await this.call<{ values?: string[][] }>(
      `/values/${SheetsClient.range(sheet, a1)}?valueRenderOption=FORMATTED_VALUE`,
    );
    return r.values ?? [];
  }

  async update(sheet: string, a1: string, values: (string | number)[][]) {
    return this.call(`/values/${SheetsClient.range(sheet, a1)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values }),
    });
  }

  async append(sheet: string, values: (string | number)[][]) {
    return this.call(
      `/values/${SheetsClient.range(sheet, 'A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values }) },
    );
  }

  /** Запись сразу многих диапазонов одним запросом. */
  async batchValues(data: { sheet: string; a1: string; values: (string | number)[][] }[]) {
    if (!data.length) return;
    return this.call('/values:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: data.map((d) => ({ range: `'${d.sheet.replace(/'/g, "''")}'!${d.a1}`, values: d.values })),
      }),
    });
  }

  async batchUpdate(requests: object[]) {
    if (!requests.length) return;
    return this.call(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
  }
}
