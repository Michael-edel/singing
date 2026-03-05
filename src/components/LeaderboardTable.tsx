import { useEffect, useState } from "react";

export type LeaderRow = {
  rank: number;
  user_id: string;
  name: string | null;
  avatar: string | null;
  best_score: number;
  last_played_at: number | null;
};

export function LeaderboardTable() {
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
        <div className="leaderTitle">Participants</div>
        <button className="btn subtle" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      <div className="leaderTable">
        <div className="leaderRow head">
          <div>#</div>
          <div>Player</div>
          <div className="right">Best</div>
        </div>

        {rows.map((r) => (
          <div className="leaderRow" key={r.user_id}>
            <div className="muted">{r.rank}</div>
            <div className="playerCell">
              {r.avatar ? <img className="avatar sm" src={r.avatar} alt="" /> : <div className="avatar sm ph" />}
              <div className="playerName">{r.name ?? "Anonymous"}</div>
            </div>
            <div className="right score">{r.best_score}</div>
          </div>
        ))}

        {!rows.length && !loading ? (
          <div className="empty">No scores yet. Be the first 🎤</div>
        ) : null}
      </div>
    </div>
  );
}
