import { useI18n } from "../i18n";

type Props={
 note:string;
 onStart:()=>void;
};

export default function DailyChallenge({note,onStart}:Props){
 const { t } = useI18n();
 return(
  <div className="daily">
    <h2>{t("daily.title")}</h2>
    <div className="dailyNote">
      {t("daily.note")}: <b>{note}</b>
    </div>
    <button onClick={onStart}>{t("daily.start")}</button>
  </div>
 );
}
