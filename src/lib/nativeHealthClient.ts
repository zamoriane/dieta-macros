"use client";
import { buildDays, type AggSample, type NativeWorkout, type Sample } from "./nativeHealth";

// Ponte para o plugin nativo. Só existe dentro da app (Capacitor); no navegador tudo devolve "não disponível".
type Cap = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: <T>(name: string) => T;
};
type HealthPlugin = {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  requestAuthorization(o: { read: string[]; write: string[] }): Promise<{ readAuthorized: string[]; readDenied: string[] }>;
  queryAggregated(o: { dataType: string; startDate: string; endDate: string; bucket: "day"; aggregation: "sum" | "average" }): Promise<{ samples: AggSample[] }>;
  readSamples(o: { dataType: string; startDate: string; endDate: string; limit: number }): Promise<{ samples: Sample[] }>;
  queryWorkouts(o: { startDate: string; endDate: string; limit: number }): Promise<{ workouts: NativeWorkout[] }>;
};

export const READ_TYPES = ["calories", "basalCalories", "steps", "exerciseTime", "sleep", "restingHeartRate", "heartRateVariability", "weight", "workouts"];
const KEY = "nativeHealthConnected";
const LAST = "nativeHealthSync";

function cap(): Cap | null {
  return typeof window === "undefined" ? null : ((window as unknown as { Capacitor?: Cap }).Capacitor ?? null);
}
export function isNativeApp(): boolean {
  return !!cap()?.isNativePlatform?.();
}
export function nativePlatform(): "ios" | "android" | "web" {
  const p = cap()?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}
let plugin: HealthPlugin | null = null;
function health(): HealthPlugin | null {
  if (!isNativeApp()) return null;
  plugin ??= cap()!.registerPlugin!<HealthPlugin>("Health");
  return plugin;
}
export function isHealthConnected(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Pede autorização de leitura. Na Apple, o sistema não diz o que foi recusado: tratamos como ligado e lemos o que vier. */
export async function connectHealth(): Promise<{ ok: boolean; reason?: string }> {
  const h = health();
  if (!h) return { ok: false, reason: "web" };
  const av = await h.isAvailable();
  if (!av.available) return { ok: false, reason: av.reason ?? "unavailable" };
  await h.requestAuthorization({ read: READ_TYPES, write: [] });
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
  return { ok: true };
}

/** Lê os últimos `days` dias e envia para o servidor. */
export async function syncHealth(days = 7): Promise<number> {
  const h = health();
  if (!h) return 0;
  const end = new Date();
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };
  const agg = (dataType: string, aggregation: "sum" | "average" = "sum") =>
    h.queryAggregated({ dataType, ...range, bucket: "day", aggregation }).then((r) => r.samples).catch(() => [] as AggSample[]);
  const [activeKcal, basalKcal, steps, exerciseMin, restingHr, hrv, sleep, weight, workouts] = await Promise.all([
    agg("calories"),
    agg("basalCalories"),
    agg("steps"),
    agg("exerciseTime"),
    agg("restingHeartRate", "average"),
    agg("heartRateVariability", "average"),
    h.readSamples({ dataType: "sleep", ...range, limit: 500 }).then((r) => r.samples).catch(() => [] as Sample[]),
    h.readSamples({ dataType: "weight", ...range, limit: 100 }).then((r) => r.samples).catch(() => [] as Sample[]),
    h.queryWorkouts({ ...range, limit: 100 }).then((r) => r.workouts).catch(() => [] as NativeWorkout[]),
  ]);
  const rows = buildDays({ activeKcal, basalKcal, steps, exerciseMin, restingHr, hrv, sleep, weight, workouts });
  const res = await fetch("/api/health/native", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: rows, platform: nativePlatform() }),
  });
  if (!res.ok) throw new Error(`sync ${res.status}`);
  try {
    localStorage.setItem(LAST, String(Date.now()));
  } catch {}
  return rows.length;
}

/** Sincroniza ao abrir a app, no máximo de 30 em 30 minutos. */
export async function autoSyncHealth(): Promise<boolean> {
  if (!isNativeApp() || !isHealthConnected()) return false;
  let last = 0;
  try {
    last = Number(localStorage.getItem(LAST) ?? 0);
  } catch {}
  if (Date.now() - last < 30 * 60_000) return false;
  await syncHealth(7);
  return true;
}
