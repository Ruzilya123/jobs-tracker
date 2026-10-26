import type { Audit, GroupRow } from '../../../core/stats';
import { GOALS, pct } from '../../../core/stats';
import { formatRu, isWorkday, weekday } from '../../../core/dates';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function Funnel({ a }: { a: Audit }) {
  const steps = [
    { label: 'Отклики', n: a.total },
    { label: 'Приглашения', n: a.invited },
    { label: 'Интервью', n: a.interviews },
    { label: 'Офферы', n: a.offers },
  ];
  const max = Math.max(1, a.total);
  return (
    <article className="card">
      <h2>Воронка</h2>
      <div className="funnel">
        {steps.map((s, i) => (
          <div className="funnel-row" key={s.label}>
            <div className="funnel-label">{s.label}</div>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: `${Math.max(2, (s.n / max) * 100)}%`, opacity: 1 - i * 0.18 }} />
            </div>
            <div className="funnel-n">
              {s.n}
              {i > 0 && <span className="muted"> · {pct(steps[i - 1].n ? s.n / steps[i - 1].n : null)}</span>}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

/** Отклики по дням за 2 недели с полосой цели 5–7 в день. */
export function Activity({ a }: { a: Audit }) {
  const W = 560;
  const H = 170;
  const pad = { l: 24, r: 8, t: 10, b: 30 };
  const top = Math.max(GOALS.dayMax + 2, ...a.daily.map((d) => d.count));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const bw = (W - pad.l - pad.r) / a.daily.length;
  return (
    <article className="card">
      <div className="card-head">
        <h2>Активность</h2>
        <div className="streak" title="Рабочих дней подряд с откликами (выходные не прерывают серию)">
          серия <b>{a.streak}</b> дн. · сегодня <b>{a.today}</b>/{GOALS.dayMin}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Отклики по дням за 14 дней">
        <rect x={pad.l} width={W - pad.l - pad.r} y={y(GOALS.dayMax)} height={y(GOALS.dayMin) - y(GOALS.dayMax)} className="goal-band" />
        <text x={W - pad.r} y={y(GOALS.dayMax) - 4} className="axis" textAnchor="end">
          цель {GOALS.dayMin}–{GOALS.dayMax}
        </text>
        {[0, 5, 10].filter((v) => v <= top).map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="gridline" />
            <text x={pad.l - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
          </g>
        ))}
        {a.daily.map((d, i) => {
          const x = pad.l + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const hit = d.count >= GOALS.dayMin;
          return (
            <g key={d.date}>
              <title>{`${formatRu(d.date)}: ${d.count}`}</title>
              <rect x={x} y={y(d.count)} width={w} height={Math.max(0, y(0) - y(d.count))} rx={3} className={hit ? 'col-hit' : isWorkday(d.date) ? 'col' : 'col-weekend'} />
              <text x={x + w / 2} y={H - 14} className="axis" textAnchor="middle">{WD[weekday(d.date)]}</text>
              <text x={x + w / 2} y={H - 2} className="axis faint" textAnchor="middle">{d.date.slice(8)}</text>
            </g>
          );
        })}
      </svg>
    </article>
  );
}

export function GroupTable({ title, rows, empty, hint }: { title: string; rows: GroupRow[]; empty: string; hint?: string }) {
  const best = Math.max(0, ...rows.map((r) => r.rate ?? 0));
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  return (
    <article className="card">
      <h2>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      {!rows.length ? (
        <p className="muted">{empty}</p>
      ) : (
        <table className="mini">
          <thead>
            <tr>
              <th />
              <th>Откликов</th>
              <th>Приглаш.</th>
              <th>Конверсия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>
                  <div className="name">{r.name}</div>
                  <div className="thin-bar"><span style={{ width: `${(r.total / maxTotal) * 100}%` }} /></div>
                </td>
                <td>{r.total}</td>
                <td>{r.invited}</td>
                <td className={r.rate && r.rate === best && best > 0 ? 'best' : ''}>{pct(r.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
