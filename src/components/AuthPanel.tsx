import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

type User = { id: string; name?: string; email?: string; avatar?: string; provider?: string };

type Props = {
  user: User | null;
  onUser: (u: User | null) => void;
};

type PublicConfig = {
  googleClientId?: string;
  appleClientId?: string;
  appleRedirectUri?: string;
};

declare global {
  interface Window {
    google?: any;
    AppleID?: any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function AuthPanel({ user, onUser }: Props) {
  const { lang, setLang, t } = useI18n();
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  const [cfg, setCfg] = useState<PublicConfig>({});
  const [err, setErr] = useState<string | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);

  // Load public config from Worker (so we don't depend on VITE_* at build time)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingCfg(true);
        const r = await fetch("/api/config", { credentials: "include" });
        const j = await r.json();
        if (!alive) return;
        setCfg(j || {});
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || String(e));
      } finally {
        if (alive) setLoadingCfg(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Google button render
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cfg.googleClientId) return;
      if (!googleBtnRef.current) return;

      try {
        await loadScript("https://accounts.google.com/gsi/client");
        if (cancelled) return;

        const google = window.google;
        if (!google?.accounts?.id) throw new Error("Google Identity Services not available");

        google.accounts.id.initialize({
          client_id: cfg.googleClientId,
          callback: async (response: any) => {
            try {
              setErr(null);
              const rr = await fetch("/api/login/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ credential: response.credential }),
              });
              const jj = await rr.json();
              if (!rr.ok) throw new Error(jj?.error || "Google login failed");
              onUser(jj.user || null);
            } catch (e: any) {
              setErr(e?.message || String(e));
            }
          },
        });

        // Clear container and render official button
        googleBtnRef.current.innerHTML = "";
        google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: window.innerWidth <= 768 ? "medium" : "large",
          shape: "pill",
          text: "signin_with",
          width: Math.min(window.innerWidth <= 768 ? 180 : 240, Math.max(160, window.innerWidth - 180)),
          locale: lang === "ru" ? "ru" : "en",
        });
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cfg.googleClientId, lang, onUser]);

  // Apple click handler (loads script on demand)
  async function signInApple() {
    try {
      setErr(null);
      if (!cfg.appleClientId || !cfg.appleRedirectUri) {
        setErr(t("auth.apple_missing"));
        return;
      }

      await loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js");

      if (!window.AppleID?.auth) throw new Error("AppleID JS not available");

      // init must be called before signIn
      window.AppleID.auth.init({
        clientId: cfg.appleClientId,
        scope: "name email",
        redirectURI: cfg.appleRedirectUri,
        usePopup: true,
      });

      const data = await window.AppleID.auth.signIn();
      const id_token = data?.authorization?.id_token;
      if (!id_token) throw new Error("Apple did not return id_token");

      const rr = await fetch("/api/login/apple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id_token }),
      });
      const jj = await rr.json();
      if (!rr.ok) throw new Error(jj?.error || "Apple login failed");
      onUser(jj.user || null);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    onUser(null);
  }

  return (
    <div className="topBar">
      <div className="authCard">
        <div className="authText">
          <div className="authTitle">{user ? t("auth.user") : t("auth.title")}</div>
          <div className="authSub">{user ? (user.name || user.email || user.id) : t("auth.providers")}</div>
          {err ? <div className="authErr">{err}</div> : null}
        </div>

        <div className="authActions">
          {user ? (
            <button className="pillBtn subtle" onClick={logout}>
              {t("auth.logout")}
            </button>
          ) : (
            <>
              <div className="googleWrap">
                {loadingCfg && !cfg.googleClientId ? (
                  <button className="pillBtn subtle" disabled>
                    {t("auth.loading")}
                  </button>
                ) : cfg.googleClientId ? (
                  <div ref={googleBtnRef} />
                ) : (
                  <button className="pillBtn subtle" disabled title="Set GOOGLE_CLIENT_ID in Worker secrets/vars">
                    {t("auth.google_missing")}
                  </button>
                )}
              </div>

              <button className="pillBtn apple" onClick={signInApple}>
                {t("auth.apple")}
              </button>
            </>
          )}

          <select className="langSelect" value={lang} onChange={(e) => setLang(e.target.value as any)} aria-label="Language">
            <option value="ru">{t("lang.ru")}</option>
            <option value="en">{t("lang.en")}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
