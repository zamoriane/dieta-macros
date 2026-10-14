"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LanguageSwitch, useI18n } from "@/lib/i18n/client";
import { authErrorKey } from "@/lib/i18n/authErrors";

export default function LoginPage() {
  const { t, locale } = useI18n();
  const sb = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar" | "recuperar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get("erro") === "link") setMsg(t("auth.linkExpirado"));
    if (sp.get("conta") === "apagada") setMsg(t("apagar.feito"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const errText = (m: string) => {
    const k = authErrorKey(m);
    return k ? t(k) : m;
  };

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
