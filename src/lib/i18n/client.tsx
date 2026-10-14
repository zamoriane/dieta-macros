"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { intlLocale, LOCALE_COOKIE, translate, translatePlural, type Locale, type MessageKey, type Vars } from "./core";

type Ctx = {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
  tp: (base: string, n: number, vars?: Vars) => string;
  /** Número formatado no idioma (vírgula decimal em PT). */
  nf: (n: number, maxDigits?: number) => string;
  /** Data formatada no idioma; aceita "AAAA-MM-DD" ou Date. */
  df: (d: string | Date, opts: Intl.DateTimeFormatOptions) => string;
  setLocale: (l: Locale, opts?: { persist?: boolean }) => void;
};

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ initial, children }: { initial: Locale; children: React.ReactNode }) {
  const [locale, setState] = useState<Locale>(initial);
  const router = useRouter();

  const setLocale = useCallback(
    (l: Locale, opts: { persist?: boolean } = {}) => {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      setState(l);
      if (opts.persist !== false) {
        // Guarda no perfil para valer noutros dispositivos (se houver sessão)
        const sb = createClient();
        sb.auth.getSession().then(({ data }) => {
          const uid = data.session?.user.id;
          if (uid) sb.from("profiles").update({ idioma: l }).eq("id", uid).then(() => undefined);
        });
      }
      router.refresh(); // título da página e partes renderizadas no servidor
    },
    [router],
  );

  const value = useMemo<Ctx>(() => {
    const il = intlLocale(locale);
    return {
      locale,
      t: (k, v) => translate(locale, k, v),
      tp: (b, n, v) => translatePlural(locale, b, n, v),
      nf: (n, maxDigits = 1) => new Intl.NumberFormat(il, { maximumFractionDigits: maxDigits }).format(n),
      df: (d, opts) => (typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00" : d) : d).toLocaleDateString(il, opts),
      setLocale,
    };
  }, [locale, setLocale]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n fora do I18nProvider");
  return c;
}

/** Seletor PT | EN compacto. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={`inline-flex rounded-lg border border-line bg-card p-0.5 text-xs font-semibold ${className}`} role="group" aria-label={t("lang.label")}>
      {(["pt", "en"] as Locale[]).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          onClick={() => locale !== l && setLocale(l)}
          className={`min-h-8 rounded-md px-2.5 ${locale === l ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
