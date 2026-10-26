import { useMemo, useState } from 'react';
import type { Application } from '../../../core/types';
import type { Audit } from '../../../core/stats';
import { STATUSES, type Status } from '../../../core/statuses';
import { formatRu } from '../../../core/dates';

const STATUS_CLASS: Partial<Record<Status, string>> = {
  'Просмотрено': 's-viewed',
  'Приглашение': 's-good',
  'Интервью 1 этап': 's-good',
  'Тестовое задание': 's-test',
  'Интервью 2 этап': 's-good',
  'Оффер': 's-offer',
  'Отказ': 's-bad',
  'Без ответа (>10 дней)': 's-muted',
  'Снял отклик': 's-muted',
};

export const StatusPill = ({ s }: { s: Status }) => <span className={`pill ${STATUS_CLASS[s] ?? ''}`}>{s}</span>;

const Link = ({ a }: { a: Application }) =>
  a.url ? (
    <a href={a.url.startsWith('http') ? a.url : `https://${a.url}`} target="_blank" rel="noreferrer">
      {a.title || a.url}
    </a>
  ) : (
    <span>{a.title || '—'}</span>
  );

export function Stale({ a }: { a: Audit }) {
  return (
    <article className="card">
      <div className="card-head">
        <h2>Без ответа больше 10 дней</h2>
        <span className="chip muted">{a.stale.length}</span>
      </div>
      <p className="hint">Пора написать follow-up или закрыть отклик.</p>
      {!a.stale.length ? (
        <p className="muted">Зависших откликов нет.</p>
      ) : (
        <ul className="stale">
          {a.stale.slice(0, 8).map((s) => (
            <li key={s.id}>
              <div>
                <div className="name">{s.company || '—'}</div>
                <div className="muted small"><Link a={s} /></div>
              </div>
              <span className="days">{s.days} дн.</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function AppsTable({ apps }: { apps: Application[] }) {
  const [status, setStatus] = useState<Status | ''>('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(20);
  const counts = useMemo(() => new Map(STATUSES.map((s) => [s, apps.filter((a) => a.status === s).length])), [apps]);
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return apps
      .filter((a) => (!status || a.status === status) && (!query || `${a.company} ${a.title} ${a.channel}`.toLowerCase().includes(query)))
      .sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : 0));
  }, [apps, status, q]);

  return (
    <article className="card wide">
      <div className="card-head">
        <h2>Все отклики</h2>
        <input className="search" placeholder="Компания, вакансия, канал" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="filters">
        <button className={!status ? 'on' : ''} onClick={() => setStatus('')}>Все · {apps.length}</button>
        {STATUSES.filter((s) => counts.get(s)).map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(status === s ? '' : s)}>
            {s} · {counts.get(s)}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="apps">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Компания</th>
              <th>Вакансия</th>
              <th>Канал</th>
              <th>Статус</th>
              <th>Письмо</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((a) => (
              <tr key={a.id}>
                <td className="nowrap">{formatRu(a.date)}</td>
                <td>{a.company || '—'}</td>
                <td><Link a={a} /></td>
                <td className="muted">{a.channel}</td>
                <td><StatusPill s={a.status} /></td>
                <td className="muted">{a.letter}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted pad">Ничего не найдено.</p>}
        {rows.length > limit && (
          <button className="more" onClick={() => setLimit((l) => l + 30)}>
            Показать ещё · осталось {rows.length - limit}
          </button>
        )}
      </div>
    </article>
  );
}
