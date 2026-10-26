import { useEffect, useMemo, useState } from 'react';
import { computeAudit } from '../../core/stats';
import { formatRu } from '../../core/dates';
import { useApplications } from './data';
import { Kpis } from './components/Kpis';
import { Activity, Funnel, GroupTable } from './components/Charts';
import { AppsTable, Stale } from './components/Lists';

const PERIODS: { label: string; days: number | null }[] = [
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 },
  { label: 'Всё время', days: null },
];

function useAgo(d: Date | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);
  if (!d) return 'загрузка…';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  return s < 10 ? 'только что' : s < 60 ? `${s} сек назад` : `${Math.round(s / 60)} мин назад`;
}

export default function App() {
  const { apps, loadedAt, error, demo, today } = useApplications();
  const [days, setDays] = useState<number | null>(() => {
    const p = new URLSearchParams(location.search).get('days');
    return p === 'all' ? null : Number(p) || 7;
  });
  const audit = useMemo(() => computeAudit(apps, { today, days }), [apps, today, days]);
  const ago = useAgo(loadedAt);

  return (
    <div className="page">
      <header className="top">
        <div>
          <div className="eyebrow">Поиск работы · Frontend-разработчик</div>
          <h1>Трекер откликов</h1>
          <div className="meta">
            <span className={`live ${error ? 'off' : ''}`} />
            {error ? error : `данные обновлены ${ago}`}
            {demo && <span className="chip muted">демо-данные</span>}
          </div>
        </div>
        <nav className="periods" aria-label="Период">
          {PERIODS.map((p) => (
            <button key={p.label} className={days === p.days ? 'on' : ''} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </nav>
      </header>

      <p className="period-note">
        Период: {formatRu(audit.period.from)} — {formatRu(audit.period.to)}
        {audit.bestChannel && <> · больше всего приглашений даёт <b>{audit.bestChannel}</b></>}
      </p>

      <Kpis a={audit} days={days} />

      <section className="grid two">
        <Funnel a={audit} />
        <Activity a={audit} />
      </section>

      <section className="grid three">
        <GroupTable title="Каналы" rows={audit.byChannel} empty="Пока нет откликов за период." />
        <GroupTable
          title="Сопроводительные письма (A/B)"
          rows={audit.byLetter}
          empty="Помечайте вариант письма кнопками в боте — здесь появится сравнение."
          hint="Какой «крючок» в письме чаще приводит к приглашению."
        />
        <Stale a={audit} />
      </section>

      <AppsTable apps={apps} />

      <footer>
        Данные — Google Таблица, которая обновляется сама: письма hh.ru и Хабр Карьеры + Telegram-бот.
        Обновление страницы — раз в минуту.
      </footer>
    </div>
  );
}
