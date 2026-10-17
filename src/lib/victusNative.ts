"use client";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { createClient } from "./supabase/client";
import { getProfile, isoDay } from "./data";
import { autoWaterLiters, getWaterLogs } from "./waterData";
import { DRINKS } from "./water";
import { drinkName, effectiveMl, goalMl, parseConfig } from "./water";
import { clockMinutes, validVictusEvent, type VictusEvent } from "./victus";
import { syncFromLogs } from "./waterReminders";
import { translate } from "./i18n/core";

type Bridge = {
  read(o: { owner: string }): Promise<{ pending: VictusEvent[] }>;
  sync(o: { owner: string; snapshot: Record<string, unknown>; ackIds: string[] }): Promise<void>;
  clear(o: { purge: boolean }): Promise<void>;
};
const native = registerPlugin<Bridge>("Victus");
export const hasVictusWidget = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Victus");
let running: Promise<void> | null = null;
let epoch = 0;
let queuedLocale: "pt" | "en" | null = null;
export async function clearVictus(purge = false) {
  epoch++;
  if (hasVictusWidget()) await native.clear({ purge });
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
    goalMl: goalMl(cfg, auto), start: clockMinutes(cfg.lembretes.inicio), end: clockMinutes(cfg.lembretes.fim), days: cfg.lembretes.dias,
    cups: cfg.copos.map(c => ({ ...c, fator: DRINKS[c.bebida].fator, label: drinkName(c.bebida, locale) })),
  } });
  await syncFromLogs(cfg.lembretes, logs, goalMl(cfg, auto), (key, vars) => translate(locale, key, vars), n => new Intl.NumberFormat(locale === "en" ? "en-GB" : "pt-PT").format(n));
  if (ackIds.length) window.dispatchEvent(new Event("victus-synced"));
}
