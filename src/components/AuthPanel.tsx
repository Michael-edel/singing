import { useEffect, useRef, useState } from "react";

type User = { id: string; name?: string; email?: string; avatar?: string; provider?: string };

type Props = {
  user: User | null;
  onUser: (u: User | null) => void;
};

declare global {
  interface Window {
    google?: any;
    AppleID?: any;
  }
}

export function AuthPanel({ user, onUser }: Props) {
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const googleRenderedRef = useRef(false);

  async function refreshMe() {
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      if (!r.ok) return;
      const data = await r.json();
      onUser(data.user ?? null);
    } catch {}
  }

  useEffect(() => {
    refreshMe();
  }, []);

  // Google button
  useEffect(() => {
    if (user) return;
    if (googleRenderedRef.current) return;
    const w = window as any;
    if (!w.google?.accounts?.id || !googleBtnRef.current) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    w.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp: any) => {
        try {
          setBusy(true);
          const r = await fetch("/api/login/google", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ credential: resp.credential }),
          });
          const data = await r.json();
          onUser(data.user ?? null);
        } finally {
          setBusy(false);
        }
      },
    });

    w.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      width: 260,
      text: "continue_with",
      shape: "pill",
    });

    googleRenderedRef.current = true;
  }, [user]);

  async function loginApple() {
    const clientId = import.meta.env.VITE_APPLE_CLIENT_ID;
    const redirectURI = import.meta.env.VITE_APPLE_REDIRECT_URI;
    if (!clientId || !redirectURI) {
      alert("Apple login: set VITE_APPLE_CLIENT_ID and VITE_APPLE_REDIRECT_URI");
      return;
    }
    const w = window as any;
    if (!w.AppleID?.auth) {
      alert("AppleID SDK not loaded yet. Try again.");
      return;
    }

    try {
      setBusy(true);
      w.AppleID.auth.init({
        clientId,
        scope: "name email",
        redirectURI,
        usePopup: true,
      });

      const resp = await w.AppleID.auth.signIn();
      const idToken = resp?.authorization?.id_token;
      if (!idToken) throw new Error("Missing Apple id_token");

      const r = await fetch("/api/login/apple", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await r.json();
      onUser(data.user ?? null);
    } catch (e: any) {
      console.warn(e);
      alert("Apple sign-in cancelled or failed.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    onUser(null);
    googleRenderedRef.current = false;
  }

  return (
    <div className="authCard">
      {user ? (
        <div className="authRow">
          <div className="authUser">
            {user.avatar ? <img className="avatar" src={user.avatar} alt="" /> : <div className="avatar ph" />}
            <div>
              <div className="authName">{user.name ?? "User"}</div>
              <div className="authMeta">{user.provider ?? ""}{user.email ? ` • ${user.email}` : ""}</div>
            </div>
          </div>
          <button className="btn subtle" onClick={logout} disabled={busy}>Logout</button>
        </div>
      ) : (
        <div className="authRow">
          <div>
            <div className="authTitle">Sign in to appear in the leaderboard</div>
            <div className="authMeta">Google / Apple</div>
          </div>
          <div className="authBtns">
            <div ref={googleBtnRef} />
            <button className="btn apple" onClick={loginApple} disabled={busy}> Sign in with Apple</button>
          </div>
        </div>
      )}
    </div>
  );
}
