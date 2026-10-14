"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LanguageSwitch, useI18n } from "@/lib/i18n/client";
import { authErrorKey } from "@/lib/i18n/authErrors";
import { isNativeApp } from "@/lib/nativeHealthClient";

// Ligar quando o fornecedor Google estiver configurado no Supabase (NEXT_PUBLIC_AUTH_GOOGLE=1 na Vercel).
const GOOGLE_ON = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1";

export default function LoginPage() {
  const { t, locale } = useI18n();
  const sb = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar" | "recuperar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Na app nativa a Google bloqueia o login dentro da WebView; lá usaremos o login nativo.
  const [showGoogle, setShowGoogle] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get("erro") === "link") setMsg(t("auth.linkExpirado"));
    if (sp.get("conta") === "apagada") setMsg(t("apagar.feito"));
    setShowGoogle(GOOGLE_ON && !isNativeApp());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const errText = (m: string) => {
    const k = authErrorKey(m);
    return k ? t(k) : m;
  };

  async function google() {
    setBusy(true);
    setMsg(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback`, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setBusy(false);
      setMsg(errText(error.message));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "recuperar") {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/nova-senha` });
      setBusy(false);
      // Mesma mensagem com ou sem conta, para não revelar que emails estão registados
      if (error) return setMsg(errText(error.message));
      return setMsg(t("auth.recuperarEnviado"));
    }
    const { error, data } =
      mode === "entrar"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/`, data: { idioma: locale } } });
    setBusy(false);
    if (error) return setMsg(errText(error.message));
    if (mode === "criar" && !data.session) return setMsg(t("auth.contaCriada"));
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Taking care of yourself</h1>
      <p className="mt-1 text-muted">{t("app.tagline")}</p>
      <form onSubmit={submit} className="mt-8 space-y-3 rounded-2xl border border-line bg-card p-5">
        {showGoogle && mode !== "recuperar" && (
          <>
            <button
              type="button"
              onClick={google}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white py-2.5 font-medium text-[#1f1f1f] disabled:opacity-60"
            >
              <GoogleLogo />
              {t("auth.google")}
            </button>
            <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              {t("auth.ou")}
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}
        <input
          className="w-full"
          type="email"
          placeholder={t("auth.email")}
          aria-label={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        {mode !== "recuperar" && (
          <input
            className="w-full"
            type="password"
            placeholder={t("auth.passwordMin")}
            aria-label={t("auth.password")}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === "entrar" ? "current-password" : "new-password"}
          />
        )}
        <button disabled={busy} className="w-full rounded-xl bg-accent py-2.5 font-medium text-on-accent disabled:opacity-60">
          {busy ? t("comum.aguarde") : mode === "entrar" ? t("auth.entrar") : mode === "criar" ? t("auth.criarConta") : t("auth.enviarLink")}
        </button>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm">
        <button
          className="text-accent"
          onClick={() => {
            setMode(mode === "entrar" ? "criar" : "entrar");
            setMsg(null);
          }}
        >
          {mode === "entrar" ? t("auth.semConta") : t("auth.comConta")}
        </button>
        {mode === "entrar" && (
          <button
            className="text-muted hover:text-ink"
            onClick={() => {
              setMode("recuperar");
              setMsg(null);
            }}
          >
            {t("auth.esqueceu")}
          </button>
        )}
      </div>
      <p className="mt-10 flex justify-center gap-4 text-xs text-muted">
        <a href="/privacidade" className="hover:text-ink">
          {t("legal.privacidade")}
        </a>
        <a href="/termos" className="hover:text-ink">
          {t("legal.termos")}
        </a>
      </p>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
