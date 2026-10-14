import { pt } from "./pt";
import { en } from "./en";

export type Locale = "pt" | "en";
export const LOCALES: { id: Locale; label: string; short: string }[] = [
  { id: "pt", label: "Português", short: "PT" },
  { id: "en", label: "English", short: "EN" },
];
export const DEFAULT_LOCALE: Locale = "pt";
export const LOCALE_COOKIE = "lang";

export type MessageKey = keyof typeof pt;
export type Messages = Record<MessageKey, string>;
export type Vars = Record<string, string | number | null | undefined>;

const DICTS: Record<Locale, Messages> = { pt, en };

/** Locale BCP-47 usado pelo Intl (datas e números). */
export const intlLocale = (l: Locale) => (l === "en" ? "en-GB" : "pt-PT");

export function isLocale(v: unknown): v is Locale {
  return v === "pt" || v === "en";
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const s = DICTS[locale][key] ?? pt[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

/** Plural simples: usa `${base}.one` quando n === 1, senão `${base}.other`. */
export function translatePlural(locale: Locale, base: string, n: number, vars?: Vars): string {
  const key = `${base}.${n === 1 ? "one" : "other"}` as MessageKey;
  return translate(locale, key, { n, ...vars });
}
