import { COLUMNS } from '../../core/types';
import { STATUSES } from '../../core/statuses';
import { SheetsClient } from './sheets';
import { config } from './config';

const STATUS_COLORS: Record<string, [number, number, number]> = {
  'Просмотрено': [0.91, 0.94, 1],
  'Приглашение': [0.86, 0.96, 0.88],
  'Интервью 1 этап': [0.8, 0.94, 0.84],
  'Тестовое задание': [1, 0.95, 0.8],
  'Интервью 2 этап': [0.72, 0.91, 0.78],
  'Оффер': [0.6, 0.87, 0.67],
  'Отказ': [0.99, 0.87, 0.87],
  'Без ответа (>10 дней)': [0.94, 0.94, 0.94],
  'Снял отклик': [0.94, 0.94, 0.94],
};

/** Создаёт и оформляет листы. Можно запускать повторно — ничего не сломает и не задвоит. */
export async function setup(client: SheetsClient) {
  let meta = await client.meta();
  const have = new Set(meta.sheets.map((s) => s.properties.title));
  const add = [config.sheet, config.auditSheet, config.stateSheet].filter((t) => !have.has(t));
  await client.batchUpdate(add.map((title) => ({ addSheet: { properties: { title } } })));
  meta = await client.meta();
  const sid = (t: string) => meta.sheets.find((s) => s.properties.title === t)!.properties.sheetId;

  // --- Отклики: заголовки (недостающие колонки дописываются справа) ---
  const header = ((await client.get(config.sheet, '1:1'))[0] ?? []).map((h) => h.trim());
  const missing = COLUMNS.map((c) => c.title).filter((t) => !header.includes(t));
  const full = header.length ? [...header, ...missing] : COLUMNS.map((c) => c.title);
  if (missing.length) await client.update(config.sheet, 'A1', [full]);
  const col = (t: string) => full.indexOf(t);

  const s = sid(config.sheet);
  const colRange = (t: string) => ({ sheetId: s, startRowIndex: 1, startColumnIndex: col(t), endColumnIndex: col(t) + 1 });
  const widths: Record<string, number> = {
    ID: 70, 'Дата отклика': 100, 'Канал': 150, 'Компания': 170, 'Вакансия': 240, 'Ссылка на вакансию': 260,
    'Статус': 170, 'Макс. этап': 140, 'Письмо': 90, 'Обновлено': 100, 'Источник': 80, 'Заметки': 240,
  };

  const requests: object[] = [
    { updateSheetProperties: { properties: { sheetId: s, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
    {
      repeatCell: {
        range: { sheetId: s, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.9, blue: 0.98 } } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    },
    ...['Статус', 'Макс. этап'].map((t) => ({
      setDataValidation: {
        range: colRange(t),
        rule: {
          condition: { type: 'ONE_OF_LIST', values: STATUSES.map((v) => ({ userEnteredValue: v })) },
          strict: false,
          showCustomUi: true,
        },
      },
    })),
    ...['Дата отклика', 'Обновлено'].map((t) => ({
      repeatCell: {
        range: colRange(t),
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd.mm.yyyy' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    })),
    ...Object.entries(widths)
      .filter(([t]) => col(t) >= 0)
      .map(([t, px]) => ({
        updateDimensionProperties: {
          range: { sheetId: s, dimension: 'COLUMNS', startIndex: col(t), endIndex: col(t) + 1 },
          properties: { pixelSize: px },
          fields: 'pixelSize',
        },
      })),
  ];

  // цвет строки по статусу — добавляем только при первом запуске, чтобы правила не множились
  if (!header.length) {
    const L = String.fromCharCode(65 + col('Статус'));
    for (const [status, [red, green, blue]] of Object.entries(STATUS_COLORS)) {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: s, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: full.length }],
            booleanRule: {
              condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=$${L}2="${status}"` }] },
              format: { backgroundColor: { red, green, blue } },
            },
          },
          index: 0,
        },
      });
    }
  }

  // служебный лист прячем
  requests.push({ updateSheetProperties: { properties: { sheetId: sid(config.stateSheet), hidden: true }, fields: 'hidden' } });
  await client.batchUpdate(requests);

  // --- Аудит: формулы прямо в таблице, чтобы куратор видел цифры и без дашборда ---
  const R = (t: string) => `'${config.sheet}'!${String.fromCharCode(65 + col(t))}2:${String.fromCharCode(65 + col(t))}`;
  const D = R('Дата отклика');
  const ST = R('Статус');
  const MX = R('Макс. этап');
  const list = (xs: string[]) => `{${xs.map((x) => `"${x}"`).join(',')}}`;
  const INV = list(['Приглашение', 'Интервью 1 этап', 'Тестовое задание', 'Интервью 2 этап', 'Оффер']);
  const INT = list(['Интервью 1 этап', 'Тестовое задание', 'Интервью 2 этап', 'Оффер']);
  const chanCol = String.fromCharCode(65 + col('Канал'));
  const dateCol = String.fromCharCode(65 + col('Дата отклика'));
  const lastCol = String.fromCharCode(65 + full.length - 1);

  await client.update(config.auditSheet, 'A1', [
    ['Аудит откликов', '', 'Норма', 'Обновляется автоматически'],
    [''],
    ['Всего откликов', `=COUNTA(${D})`, ''],
    ['Дошли до приглашения', `=SUMPRODUCT(--ISNUMBER(MATCH(${MX},${INV},0)))`, ''],
    ['Дошли до интервью', `=SUMPRODUCT(--ISNUMBER(MATCH(${MX},${INT},0)))`, ''],
    ['Офферов', `=COUNTIF(${MX},"Оффер")`, ''],
    ['Отказов', `=COUNTIF(${ST},"Отказ")`, ''],
    [''],
    ['Отклик → приглашение', '=IFERROR(B4/B3,"—")', '10–20%'],
    ['Приглашение → интервью', '=IFERROR(B5/B4,"—")', '70–90%'],
    ['Интервью → оффер', '=IFERROR(B6/B5,"—")', '20–30%'],
    [''],
    ['Откликов за 7 дней', `=COUNTIFS(${D},">="&(TODAY()-6))`, '25–30'],
    ['Висят >10 дней без ответа', `=COUNTIFS(${ST},"Отправлено",${D},"<"&(TODAY()-10))+COUNTIFS(${ST},"Просмотрено",${D},"<"&(TODAY()-10))+COUNTIF(${ST},"Без ответа (>10 дней)")`, 'follow-up'],
    [''],
    ['По каналам'],
    [
      `=QUERY('${config.sheet}'!A1:${lastCol},"select ${chanCol}, count(${dateCol}) where ${dateCol} is not null group by ${chanCol} order by count(${dateCol}) desc label ${chanCol} 'Канал', count(${dateCol}) 'Откликов'",1)`,
    ],
  ]);
  const a = sid(config.auditSheet);
  await client.batchUpdate([
    {
      repeatCell: {
        range: { sheetId: a, startRowIndex: 8, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 2 },
        cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0%' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    },
    {
      repeatCell: {
        range: { sheetId: a, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
        fields: 'userEnteredFormat.textFormat',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: a, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 230 },
        fields: 'pixelSize',
      },
    },
  ]);

  return { added: add, missingColumns: missing };
}
