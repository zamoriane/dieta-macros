"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useI18n } from "@/lib/i18n/client";
import { clearVictus, syncVictus } from "@/lib/victusNative";

/** Foreground reconciliation; never sends session tokens into widget storage. */
export function VictusSync() {
  const { locale } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const launchHandled = useRef(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const app = registerPlugin<{
      getLaunchUrl(): Promise<{ url?: string }>;
      addListener(event: string, callback: (event: { url?: string; isActive?: boolean }) => void): Promise<{ remove(): Promise<void> }>;
    }>("App");
    const open = ({ url }: { url?: string }) => { if (url === "takingcare://agua" || url === "takingcare://agua/") router.push("/agua"); };
    if (!launchHandled.current) {
      launchHandled.current = true;
      void app.getLaunchUrl().then(open).catch(() => {});
    }
    const urlListener = app.addListener("appUrlOpen", open);
    const activeListener = app.addListener("appStateChange", e => { if (e.isActive) void syncVictus(locale).catch(() => {}); });
    return () => {
      void urlListener.then(l => l.remove()).catch(() => {});
      void activeListener.then(l => l.remove()).catch(() => {});
    };
  }, [router, locale]);
  useEffect(() => {
    const sync = () => { if (document.visibilityState === "visible") void syncVictus(locale).catch(() => {}); };
    if (path.startsWith("/login") || path.startsWith("/conta-desativada")) void clearVictus().catch(() => {});
    else sync();
    const submit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || new URL(form.action).pathname !== "/auth/signout") return;
      event.preventDefault();
      void clearVictus().catch(() => {}).finally(() => HTMLFormElement.prototype.submit.call(form));
    };
    document.addEventListener("submit", submit, true);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("water-changed", sync);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    const timer = setInterval(sync, 60_000);
    return () => {
      document.removeEventListener("submit", submit, true);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("water-changed", sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      clearInterval(timer);
    };
  }, [locale, path]);
  return null;
}
