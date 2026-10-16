"use client";
import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./nativeHealthClient";
import { reminderTimes, type Reminders } from "./water";

// Lembretes de água: notificações locais no telemóvel (@capacitor/local-notifications).
// Agendadas no próprio aparelho: funcionam sem internet e sem servidor.
// O iOS aceita no máximo 64 notificações pendentes, por isso agendam-se os próximos dias
// e reagenda-se sempre que se regista uma bebida ou se abre a app.

type Perm = { display: "granted" | "denied" | "prompt" | "prompt-with-rationale" };
type LocalNotificationsPlugin = {
  checkPermissions(): Promise<Perm>;
  requestPermissions(): Promise<Perm>;
  schedule(o: { notifications: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle?: boolean } }[] }): Promise<unknown>;
  getPending(): Promise<{ notifications: { id: number }[] }>;
  cancel(o: { notifications: { id: number }[] }): Promise<void>;
};

const BASE_ID = 7000; // ids 7000–7099 reservados à água
let plugin: LocalNotificationsPlugin | null = null;
function ln(): LocalNotificationsPlugin | null {
  if (!isNativeApp()) return null;
  plugin ??= registerPlugin<LocalNotificationsPlugin>("LocalNotifications");
  return plugin;
}

export function remindersSupported(): boolean {
  return isNativeApp();
}

/** Pede autorização para notificações. Devolve false se recusada ou se a app ainda não tiver o plugin. */
export async function askReminderPermission(): Promise<"ok" | "negado" | "atualizar"> {
  const p = ln();
  if (!p) return "atualizar";
  try {
    let st = await p.checkPermissions();
    if (st.display !== "granted") st = await p.requestPermissions();
    return st.display === "granted" ? "ok" : "negado";
  } catch {
    return "atualizar"; // build antigo da app, sem o plugin de notificações
  }
}

async function cancelWater(p: LocalNotificationsPlugin) {
  const pending = await p.getPending();
  const ids = pending.notifications.filter((n) => n.id >= BASE_ID && n.id < BASE_ID + 100).map((n) => ({ id: n.id }));
  if (ids.length) await p.cancel({ notifications: ids });
}

/**
 * Cancela os lembretes de água e volta a agendá-los conforme a configuração e o que já se bebeu hoje.
 * Seguro de chamar em qualquer sítio: no navegador ou sem permissão não faz nada.
 */
export async function syncWaterReminders(opts: {
  cfg: Reminders;
  consumedMl: number;
  goalMl: number;
  lastDrinkAt: Date | null;
  text: { title: string; bodyToday: (faltaL: string) => string; bodyLater: string };
  litros: (ml: number) => string;
}): Promise<number> {
  const p = ln();
  if (!p) return 0;
  try {
    await cancelWater(p);
    if (!opts.cfg.ativo) return 0;
    const st = await p.checkPermissions();
    if (st.display !== "granted") return 0;
    const now = new Date();
    const times = reminderTimes({ cfg: opts.cfg, now, lastDrinkAt: opts.lastDrinkAt, consumedMl: opts.consumedMl, goalMl: opts.goalMl, days: 3, max: 60 });
    if (!times.length) return 0;
    const isToday = (d: Date) => d.toDateString() === now.toDateString();
    const falta = opts.litros(Math.max(0, opts.goalMl - opts.consumedMl));
    await p.schedule({
      notifications: times.map((at, i) => ({
        id: BASE_ID + i,
        title: opts.cfg.texto.trim() || opts.text.title,
        body: isToday(at) ? opts.text.bodyToday(falta) : opts.text.bodyLater,
        schedule: { at, allowWhileIdle: true },
      })),
    });
    return times.length;
  } catch {
    return 0;
  }
}

type T = (k: "agua.notif.titulo" | "agua.notif.hoje" | "agua.notif.depois", v?: Record<string, string | number>) => string;

/** Atalho: reagenda a partir dos registos de hoje (usado no Hoje e na página Água). */
export function syncFromLogs(
  cfg: Reminders,
  todayLogs: { hora: string; ml: number; fator: number }[],
  goalMl: number,
  t: T,
  nf: (n: number) => string,
) {
  const consumed = todayLogs.reduce((s, l) => s + Math.round(l.ml * l.fator), 0);
  const last = todayLogs.length ? new Date(todayLogs[todayLogs.length - 1].hora) : null;
  return syncWaterReminders({
    cfg,
    consumedMl: consumed,
    goalMl,
    lastDrinkAt: last,
    litros: (ml) => nf(Math.round(ml / 100) / 10),
    text: {
      title: t("agua.notif.titulo"),
      bodyToday: (falta) => t("agua.notif.hoje", { l: falta }),
      bodyLater: t("agua.notif.depois"),
    },
  });
}
