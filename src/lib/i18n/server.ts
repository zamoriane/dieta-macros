import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, translate, type Locale, type MessageKey } from "./core";

export async function serverLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getT() {
  const l = await serverLocale();
  return { locale: l, t: (k: MessageKey, v?: Record<string, string | number>) => translate(l, k, v) };
}
