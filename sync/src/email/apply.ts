import type { Application } from '../../../core/types';
import { todayIn } from '../../../core/dates';
import { config } from '../config';
import type { Store } from '../store';
import { KIND_TO_STATUS, type EmailEvent } from './rules';

export interface EmailChange {
  app: Application;
  created: boolean;
  status: string;
  event: EmailEvent;
}

/** Применяет распознанные письма к таблице: находит отклик (или создаёт) и двигает статус. */
export function applyEmailEvents(store: Store, events: EmailEvent[]): EmailChange[] {
  const changes: EmailChange[] = [];
  for (const ev of events) {
    if (ev.kind === 'skip') continue;
    const status = KIND_TO_STATUS[ev.kind];
    let app = (ev.url && store.findByUrl(ev.url)) || store.findByTitle(ev.company, ev.title);
    if (!app) {
      app = store.add({
        date: todayIn(config.tz, ev.date),
        channel: ev.platform,
        company: ev.company,
        title: ev.title,
        url: ev.url,
        status,
        source: 'почта',
      });
      changes.push({ app, created: true, status, event: ev });
      continue;
    }
    // заполняем пустые поля тем, что удалось достать из письма
    const fill: Partial<Application> = {};
    if (!app.url && ev.url) fill.url = ev.url;
    if (!app.company && ev.company) fill.company = ev.company;
    if (!app.title && ev.title) fill.title = ev.title;
    if (Object.keys(fill).length) store.patch(app, fill);

    if (store.autoStatus(app, status)) changes.push({ app, created: false, status, event: ev });
  }
  return changes;
}
