import { motion } from "framer-motion";
import { GlowButton } from "./GlowButton";
import { useI18n } from "../i18n";

type Props = {
  onStart: () => void;
};

export default function HomeScreen({ onStart }: Props) {
  const { t } = useI18n();

  return (
    <div className="homeShell">
      <motion.div
        className="homeCard"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="homeBadge">{t("home.badge")}</div>
        <div className="homeHead">
          <h1 className="homeTitle">MiniVocalGame</h1>
          <div className="homeSub">{t("home.subtitle")}</div>
          <div className="homeGoal">{t("home.goal")}</div>
        </div>

        <div className="homeSpotlight">
          <div className="homeFeature"><span>🎯</span><b>{t("home.feature.rounds.title")}</b><small>{t("home.feature.rounds.sub")}</small></div>
          <div className="homeFeature"><span>⭐</span><b>{t("home.feature.accuracy.title")}</b><small>{t("home.feature.accuracy.sub")}</small></div>
          <div className="homeFeature"><span>🏆</span><b>{t("home.feature.leaderboard.title")}</b><small>{t("home.feature.leaderboard.sub")}</small></div>
        </div>

        <div className="homeActions">
          <GlowButton onClick={onStart} className="homePrimary">
            🎤 {t("home.start")}
          </GlowButton>
          <div className="homeTip">{t("home.tip")}</div>
        </div>
      </motion.div>
    </div>
  );
}
