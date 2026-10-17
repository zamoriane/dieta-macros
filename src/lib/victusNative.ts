"use client";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { createClient } from "./supabase/client";
import { getProfile, isoDay } from "./data";
import { autoWaterLiters, getWaterLogs } from "./waterData";
import { DRINKS, reminderTimes, type WaterConfig } from "./water";
import { drinkName, effectiveMl, goalMl, parseConfig } from "./water";
import { clockMinutes, validVictusEvent, type VictusEvent } from "./victus";
import { syncFromLogs } from "./waterReminders";
import { translate } from "./i18n/core";

type Bridge = {
  liveStatus(): Promise<{ installationId?: string; pushStartToken?: string; lastStartedDay?: string; enabled: boolean; choice?: string }>;
  read(o: { owner: string }): Promise<{ pending: VictusEvent[] }>;
  sync(o: { owner: string; snapshot: Record<string, unknown>; ackIds: string[] }): Promise<void>;
  clear(o: { purge: boolean }): Promise<void>;
};
const native = registerPlugin<Bridge>("Victus");
export const hasVictusWidget = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Victus");
let running: Promise<void> | null = null;
let epoch = 0;
let queuedLocale: "pt" | "en" | null = null;
let remoteQueue: Promise<void> = Promise.resolve();
export async function clearVictus(purge = false) {
  epoch++;
  if (hasVictusWidget()) {
    const status = Capacitor.getPlatform() === "ios" ? await native.liveStatus().catch(() => null) : null;
    await native.clear({ purge });
    if (status?.installationId) await postLive({ installationId: status.installationId, enabled: false });
  }
}
function postLive(body: Record<string, unknown>) {
  remoteQueue = remoteQueue.catch(() => {}).then(() => sendLive(body));
  return remoteQueue;
}
async function sendLive(body: Record<string, unknown>) {
  try {
    const res = await fetch("/api/victus/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    const result = res.ok ? await res.json() : { remote: false };
    window.dispatchEvent(new CustomEvent("victus-remote-status", { detail: result.remote === true }));
  } catch { window.dispatchEvent(new CustomEvent("victus-remote-status", { detail: false })); }
}
export async function disableVictusRemote() {
  if (Capacitor.getPlatform() !== "ios") return;
  const status = await native.liveStatus().catch(() => null);
  if (status?.installationId) await postLive({ installationId: status.installationId, enabled: false });
}
async function registerLive(cfg: WaterConfig, logs: { hora: string; ml: number; fator: number }[], goal: number, locale: "pt" | "en", generation: number) {
  if (Capacitor.getPlatform() !== "ios") return;
  const s = await native.liveStatus().catch(() => null);
  if (!s?.installationId || generation !== epoch) return;
  if (s.choice !== "accepted" || !s.enabled || !cfg.lembretes.ativo || !s.pushStartToken) {
    await postLive({ installationId: s.installationId, enabled: false }); return;
  }
  const now = new Date();
  const times = reminderTimes({ cfg: cfg.lembretes, now, consumedMl: logs.reduce((sum, l) => sum + effectiveMl(l.ml, l.fator), 0), goalMl: goal,
    lastDrinkAt: logs.length ? new Date(Math.max(...logs.map(l => Date.parse(l.hora)))) : null, days: 3, max: 1000 });
  const seen = new Set<string>();
  const slots = times.flatMap(at => {
    const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
    if (seen.has(day) || day === s.lastStartedDay) return [];
    seen.add(day);
    const end = new Date(at); const [h, m] = cfg.lembretes.fim.split(":").map(Number); end.setHours(h, m, 0, 0);
    const expires = new Date(Math.min(end.getTime(), at.getTime() + 8 * 3600_000));
    return expires > at ? [{ day, at: at.toISOString(), expires: expires.toISOString() }] : [];
  });
  await postLive({ installationId: s.installationId, enabled: true, token: s.pushStartToken,
    lastStartedDay: s.lastStartedDay, locale, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, goalMl: goal, slots });
}
export function syncVictus(locale: "pt" | "en") {
  if (!hasVictusWidget()) return Promise.resolve();
  if (running) { queuedLocale = locale; return running; }
  running = reconcile(locale).finally(() => {
    running = null;
    const next = queuedLocale; queuedLocale = null;
    if (next) void syncVictus(next).catch(() => {});
  });
  return running;
}
async function reconcile(locale: "pt" | "en") {
  const generation = epoch;
  const sb = createClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { await clearVictus(); return; }
  const owner = session.user.id;
  const { pending } = await native.read({ owner });
  if (generation !== epoch) return;
  const ackIds: string[] = [];
  for (const e of pending) {
    if (!validVictusEvent(e, owner) || !(e.bebida in DRINKS)) throw new Error("Invalid Victus outbox event");
    // Original date, time and hydration factor are retained, even across midnight/settings changes.
    const { error } = await sb.from("water_logs").upsert({
      user_id: owner, client_event_id: e.id, dia: e.day, hora: e.at,
      ml: e.ml, bebida: e.bebida, fator: e.fator,
    }, { onConflict: "user_id,client_event_id", ignoreDuplicates: true });
    if (error) throw error; // No acknowledgement on failure: safe retry after migration/network recovery.
    ackIds.push(e.id);
  }
  const profile = await getProfile(sb);
  if (profile.id !== owner || generation !== epoch) return;
  if (profile.ativo === false) { await clearVictus(); return; }
  const day = isoDay();
  const cfg = parseConfig(profile.agua);
  const [logs, auto] = await Promise.all([getWaterLogs(sb, owner, day, day), autoWaterLiters(sb, profile, day, true)]);
  const { data: { session: current } } = await sb.auth.getSession();
  if (current?.user.id !== owner || generation !== epoch) return;
  await native.sync({ owner, ackIds, snapshot: {
    day, locale, updatedAt: new Date().toISOString(),
    consumedMl: logs.reduce((n, l) => n + effectiveMl(l.ml, l.fator), 0),
    goalMl: goalMl(cfg, auto), start: clockMinutes(cfg.lembretes.inicio), end: clockMinutes(cfg.lembretes.fim), days: cfg.lembretes.dias, remindersActive: cfg.lembretes.ativo,
    cups: cfg.copos.map(c => ({ ...c, fator: DRINKS[c.bebida].fator, label: drinkName(c.bebida, locale) })),
  } });
  await syncFromLogs(cfg.lembretes, logs, goalMl(cfg, auto), (key, vars) => translate(locale, key, vars), n => new Intl.NumberFormat(locale === "en" ? "en-GB" : "pt-PT").format(n));
  if (generation === epoch) await registerLive(cfg, logs, goalMl(cfg, auto), locale, generation);
  if (ackIds.length) window.dispatchEvent(new Event("victus-synced"));
}
