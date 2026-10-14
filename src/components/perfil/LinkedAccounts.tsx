"use client";
import { useCallback, useEffect, useState } from "react";
import type { UserIdentity } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isNativeApp, nativePlatform } from "@/lib/nativeHealthClient";
import { nativeLink } from "@/lib/nativeAuth";
import { useI18n } from "@/lib/i18n/client";
import { toast } from "@/components/ui/Toast";

type Provider = "google" | "apple";
const ENABLED: Record<Provider, boolean> = {
  google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1",
  apple: process.env.NEXT_PUBLIC_AUTH_APPLE === "1",
};
const LABEL: Record<Provider, string> = { google: "Google", apple: "Apple" };

/** Ligar/desligar contas Google e Apple à conta atual, para entrar com qualquer uma. */
export function LinkedAccounts() {
  const { t } = useI18n();
  const [sb] = useState(createClient);
  const [ids, setIds] = useState<UserIdentity[] | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [confirm, setConfirm] = useState<Provider | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);

  const load = useCallback(async () => {
    const { data } = await sb.auth.getUserIdentities();
    setIds(data?.identities ?? []);
  }, [sb]);

  useEffect(() => {
    load();
    const native = isNativeApp();
    // Na app Android não há login Apple nativo.
    setProviders((["apple", "google"] as Provider[]).filter((p) => ENABLED[p] && !(p === "apple" && native && nativePlatform() !== "ios")));
    const sp = new URLSearchParams(location.search);
    if (sp.get("ligada")) toast(t("ligadas.ok"));
    const err = sp.get("ligacao_erro");
    if (err) setMsg(errText(err));
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  function errText(m: string) {
    if (/manual linking/i.test(m)) return t("ligadas.err.desativado");
    if (/already.*(linked|exists)|identity_already_exists/i.test(m)) return t("ligadas.err.outraConta");
    return m;
  }

  async function link(p: Provider) {
    setBusy(p);
    setMsg(null);
    if (isNativeApp()) {
      const r = await nativeLink(sb, p);
      setBusy(null);
      if (r.error) return setMsg(errText(r.error));
      if (!r.cancelled) {
        toast(t("ligadas.ok"));
        load();
      }
      return;
    }
    const next = encodeURIComponent("/perfil?ligada=1");
    const { error } = await sb.auth.linkIdentity({ provider: p, options: { redirectTo: `${location.origin}/auth/callback?next=${next}` } });
    if (error) {
      setBusy(null);
      setMsg(errText(error.message));
    }
  }

  async function unlink(identity: UserIdentity) {
    const p = identity.provider as Provider;
    setBusy(p);
    setMsg(null);
    const { error } = await sb.auth.unlinkIdentity(identity);
    setBusy(null);
    setConfirm(null);
    if (error) return setMsg(errText(error.message));
    toast(t("ligadas.desligada"));
    load();
  }

  if (!providers.length) return null;
  const total = ids?.length ?? 0;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("ligadas.titulo")}</h3>
      <p className="text-xs text-muted">{t("ligadas.dica")}</p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {providers.map((p) => {
          const idn = ids?.find((i) => i.provider === p);
          const email = (idn?.identity_data as { email?: string } | undefined)?.email;
          return (
            <li key={p} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{LABEL[p]}</span>
                <span className="block truncate text-xs text-muted">{ids === null ? "…" : idn ? email || t("ligadas.ligada") : t("ligadas.naoLigada")}</span>
              </span>
              {ids !== null &&
                (idn ? (
                  total > 1 &&
                  (confirm === p ? (
                    <span className="flex gap-1">
                      <button className="btn btn-ghost !px-2 text-xs" onClick={() => setConfirm(null)}>
                        {t("comum.cancelar")}
                      </button>
                      <button className="btn btn-ghost !px-2 text-xs !text-bad" disabled={busy === p} onClick={() => unlink(idn)}>
                        {t("ligadas.confirmarDesligar")}
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost text-xs" onClick={() => setConfirm(p)}>
                      {t("ligadas.desligar")}
                    </button>
                  ))
                ) : (
                  <button className="btn btn-ghost text-xs" disabled={busy !== null} onClick={() => link(p)}>
                    {busy === p ? t("comum.aguarde") : t("ligadas.ligar")}
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
      {msg && <p className="text-xs text-bad">{msg}</p>}
    </div>
  );
}
