import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export type LeaderRow = {
  rank: number;
  user_id: string;
  name: string | null;
  avatar: string | null;
  best_score: number;
  last_played_at: number | null;
};

export function LeaderboardTable({ currentUserId }: { currentUserId?: string | null }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [scope, setScope] = useState<'global' | 'daily' | 'week'>('global');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      const r = await fetch("/api/leaderboard", { credentials: "include" });
      const data = await r.json();
      setRows(Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  return (
    <div className="leaderboardCard">
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className={scope === 'global' ? 'v6BtnActive' : 'v6Btn'} onClick={() => setScope('global')}>
          Global
        </button>
        <button className={scope === 'daily' ? 'v6BtnActive' : 'v6Btn'} onClick={() => setScope('daily')}>
          Today
        </button>
        <button className={scope === 'week' ? 'v6BtnActive' : 'v6Btn'} onClick={() => setScope('week')}>
          This week
        </button>
      </div>
      <div className="leaderboardHeader">
        <div className="leaderboardTitle">{t("lb.title")}</div>
        <button className="pillBtn subtle" onClick={load} disabled={loading}>
          {t("lb.refresh")}
        </button>
      </div>

      {loading ? (
        <div className="lbHint">{t("lb.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="lbHint">{t("lb.empty")}</div>
      ) : (
        <div className="lbTable">
          {rows.map((r) => {
            const me = !!currentUserId && r.user_id === currentUserId;
            return (
              <div key={r.user_id} className={"lbRow" + (me ? " me" : "")}>
                <div className="lbRank">{r.rank}</div>
                <div className="lbUser">
                  {r.avatar ? <img className="lbAvatar" src={r.avatar} alt="" /> : <div className="lbAvatar ph" />}
                  <div className="lbName">{r.name || t("lb.anon")}</div>
                </div>
                <div className="lbScore">{r.best_score}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}