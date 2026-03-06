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
        <div className="homeBadge">Вокальный challenge</div>
        <div className="homeHead">
          <h1 className="homeTitle">MiniVocalGame</h1>
          <div className="homeSub">Попади в ноту, удержи звук и набери максимум очков.</div>
          <div className="homeGoal">Чем точнее и стабильнее голос, тем выше рейтинг и шанс быть первым.</div>
        </div>

        <div className="homeSpotlight">
          <div className="homeFeature"><span>🎯</span><b>5 раундов</b><small>коротко и азартно</small></div>
          <div className="homeFeature"><span>⭐</span><b>точность</b><small>звёзды за попадание</small></div>
          <div className="homeFeature"><span>🏆</span><b>топ игроков</b><small>обгони остальных</small></div>
        </div>

        <div className="homeActions">
          <GlowButton onClick={onStart} className="homePrimary">
            🎤 {t("home.start")}
          </GlowButton>
          <div className="homeTip">Совет: для лучшего результата надень наушники и пой после сигнала.</div>
        </div>
      </motion.div>
    </div>
  );
}
