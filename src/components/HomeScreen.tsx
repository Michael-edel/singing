import { motion } from "framer-motion";
import { GlowButton } from "./GlowButton";
import { useI18n } from "../i18n";

type Props = {
  onStart: () => void;
  onLeaderboard: () => void;
};

export default function HomeScreen({ onStart, onLeaderboard }: Props) {
  const { t } = useI18n();

  return (
    <div className="homeShell">
      <div className="homeBackdrop" aria-hidden />
      <motion.div
        className="homeCard homeCardV20"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <div className="homeBrand">
          <div className="homeBadge">JIV0I ZVUK</div>
          <h1 className="homeTitleV20">MiniVocalGame</h1>
          <div className="homeSubV20">{t("home.subtitle")}</div>
        </div>

        <div className="homeCTA">
          <GlowButton onClick={onStart} className="homePrimaryV20">
            <span className="micBtn">
              <span className="micIcon">🎤</span>
              <span className="micText">{t("home.start")}</span>
            </span>
          </GlowButton>

          <div className="homeRow">
            <button type="button" className="homePill" onClick={onLeaderboard}>
              🏆 {t("home.leaderboard")}
            </button>
            <div className="homeTipV20">{t("home.tip")}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
