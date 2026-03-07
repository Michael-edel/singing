import { motion } from "framer-motion";
import { useI18n } from "../i18n";

type Props = {
  onStart: () => void;
  onLeaderboard: () => void;
};

export default function GameMenu({ onStart, onLeaderboard }: Props) {
  const { t } = useI18n();
  return (
    <div className="menuShell">
      <div className="menuBackdrop" aria-hidden />

      <motion.div
        className="menuCard"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <img className="menuCover" src="/cover.jpg" alt="MiniVocalGame cover" />

        <div className="menuHead">
          <div className="menuKicker">{t("menu.kicker")}</div>
          <h2 className="menuTitle">MiniVocalGame</h2>
          <div className="menuSub">{t("menu.subtitle")}</div>
        </div>

        <div className="menuButtons">
          <button className="menuPrimary" onClick={onStart} type="button">
            ▶ {t("menu.start")}
          </button>
          <button className="menuSecondary" onClick={onLeaderboard} type="button">
            🏆 {t("menu.leaderboard")}
          </button>
        </div>

        <div className="menuTip">{t("menu.tip")}</div>
      </motion.div>
    </div>
  );
}
