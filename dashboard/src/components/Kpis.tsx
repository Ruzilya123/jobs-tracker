import type { Audit, Rate } from '../../../core/stats';
import { GOALS, pct } from '../../../core/stats';

function Norm({ r }: { r: Rate }) {
  const cls = r.verdict === 'ниже нормы' ? 'warn' : r.verdict === 'нет данных' ? 'muted' : 'ok';
  return (
    <span className={`chip ${cls}`} title={`Норма ${Math.round(r.norm[0] * 100)}–${Math.round(r.norm[1] * 100)}%`}>
      {pct(r.value)} · {r.verdict}
    </span>
  );
}

export function Kpis({ a, days }: { a: Audit; days: number | null }) {
  const weekGoal = days === 7;
  const goalPct = Math.min(1, a.total / GOALS.weekMin);
  return (
    <section className="kpis">
      <article className="card kpi">
        <div className="kpi-label">Откликов</div>
        <div className="kpi-value">{a.total}</div>
        {weekGoal ? (
          <>
            <div className="bar" aria-label={`Цель недели ${GOALS.weekMin}–${GOALS.weekMax}`}>
              <span style={{ width: `${goalPct * 100}%` }} />
            </div>
            <div className="kpi-sub">цель недели {GOALS.weekMin}–{GOALS.weekMax}</div>
          </>
        ) : (
          <div className="kpi-sub">отказов: {a.rejected}</div>
        )}
      </article>
      <article className="card kpi">
        <div className="kpi-label">Приглашений</div>
        <div className="kpi-value">{a.invited}</div>
        <Norm r={a.conv.invite} />
        <div className="kpi-sub">отклик → приглашение, норма 10–20%</div>
      </article>
      <article className="card kpi">
        <div className="kpi-label">Интервью</div>
        <div className="kpi-value">{a.interviews}</div>
        <Norm r={a.conv.interview} />
        <div className="kpi-sub">приглашение → интервью, норма 70–90%</div>
      </article>
      <article className="card kpi">
        <div className="kpi-label">Офферов</div>
        <div className="kpi-value accent">{a.offers}</div>
        <Norm r={a.conv.offer} />
        <div className="kpi-sub">интервью → оффер, норма 20–30%</div>
      </article>
    </section>
  );
}
