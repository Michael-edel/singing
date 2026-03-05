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

export function LeaderboardTable() {
  const { t } = useI18n();
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      const r = await fetch("/api/leaderboard", { credentials: "include" });
      const data = await r.json();
      setRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="leaderCard">
      <div className="leaderHeader">
        <div className="leaderTitle">{t("lb.title")}</div>
        <button className="btn subtle" onClick={load} disabled={loading}>{loading ? t("lb.loading") : t("lb.refresh")}</button>
      </div>

      <div className="leaderTable">
        <div className="leaderRow head">
          <div>#</div>
          <div>{t("lb.player")}</div>
          <div className="right">{t("lb.best")}</div>
        </div>

        {rows.map((r) => (
          <div className="leaderRow" key={r.user_id}>
            <div className="muted">{r.rank}</div>
            <div className="playerCell">
              {r.avatar ? <img className="avatar sm" src={r.avatar} alt="" /> : <div className="avatar sm ph" />}
              <div className="playerName">{r.name ?? t("lb.anon")}</div>
            </div>
            <div className="right score">{r.best_score}</div>
          </div>
        ))}

        {!rows.length && !loading ? (
          <div className="empty">{t("lb.empty")}</div>
        ) : null}
      </div>
    </div>
  );
}
