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
      <div className="homeBackdrop" aria-hidden />
      <motion.div
        className="homeCard"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="homeHero">
          <img className="homeHeroImg" src="/cover.jpg" alt="MiniVocalGame" />
          <div className="homeHeroOverlay" aria-hidden />
        </div>

        <div className="homeHead">
          <h1 className="homeTitle">MiniVocalGame</h1>
          <div className="homeSub">{t("home.subtitle")}</div>
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
