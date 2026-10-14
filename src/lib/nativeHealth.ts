// Apple Saúde / Health Connect através da app nativa (Capacitor + @capgo/capacitor-health).
// Este ficheiro é puro (sem rede): transforma as respostas do plugin em linhas de health_daily.
import type { Workout } from "./applehealth";

export type AggSample = { startDate: string; endDate: string; value: number };
export type Sample = { startDate: string; endDate: string; value: number; sleepState?: string };
export type NativeWorkout = {
  workoutType: string;
  duration: number; // segundos
  totalEnergyBurned?: number;
  totalDistance?: number; // metros
  startDate: string;
  endDate: string;
  platformId?: string;
};

export type DayRow = {
  dia: string;
  active_kcal?: number;
  basal_kcal?: number;
  steps?: number;
  exercise_min?: number;
  sleep_min?: number;
  resting_hr?: number;
  hrv_ms?: number;
  weight_kg?: number;
  workouts?: Workout[];
};

/** Dia local (do telemóvel) de uma data ISO. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "traditionalStrengthTraining" → "Traditional Strength Training" */
export function workoutName(type: string): string {
  const s = type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ASLEEP = new Set(["asleep", "rem", "deep", "light"]);

export function buildDays(input: {
  activeKcal?: AggSample[];
  basalKcal?: AggSample[];
  steps?: AggSample[];
  exerciseMin?: AggSample[];
  restingHr?: AggSample[];
  hrv?: AggSample[];
  sleep?: Sample[];
  weight?: Sample[];
  workouts?: NativeWorkout[];
}): DayRow[] {
  const days = new Map<string, DayRow>();
  const day = (d: string) => {
    if (!days.has(d)) days.set(d, { dia: d });
    return days.get(d)!;
  };
  const put = (list: AggSample[] | undefined, key: keyof DayRow, round = 0) => {
    for (const s of list ?? []) {
      if (s.value == null || !Number.isFinite(s.value)) continue;
      const f = 10 ** round;
      (day(localDay(s.startDate)) as Record<string, unknown>)[key] = Math.round(s.value * f) / f;
    }
  };
  put(input.activeKcal, "active_kcal");
  put(input.basalKcal, "basal_kcal");
  put(input.steps, "steps");
  put(input.exerciseMin, "exercise_min");
  put(input.restingHr, "resting_hr");
  put(input.hrv, "hrv_ms", 1);

  // Sono: soma dos períodos a dormir, atribuídos ao dia em que acorda
  const sleep = new Map<string, number>();
  for (const s of input.sleep ?? []) {
    if (s.sleepState && !ASLEEP.has(s.sleepState)) continue;
    const min = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
    if (min > 0 && min < 24 * 60) sleep.set(localDay(s.endDate), (sleep.get(localDay(s.endDate)) ?? 0) + min);
  }
  for (const [d, m] of sleep) day(d).sleep_min = Math.round(m);

  // Peso: a última pesagem de cada dia
  const w = [...(input.weight ?? [])].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  for (const s of w) if (s.value > 20 && s.value < 400) day(localDay(s.startDate)).weight_kg = Math.round(s.value * 10) / 10;

  for (const x of input.workouts ?? []) {
    const d = day(localDay(x.startDate));
    (d.workouts ??= []).push({
      id: x.platformId,
      name: workoutName(x.workoutType),
      start: x.startDate,
      end: x.endDate,
      min: x.duration ? Math.round(x.duration / 60) : null,
      kcal: x.totalEnergyBurned != null ? Math.round(x.totalEnergyBurned) : null,
      km: x.totalDistance ? Math.round(x.totalDistance / 10) / 100 : null,
    });
  }
  return [...days.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1));
}

/** Junta treinos: os que já existem (ex.: do Health Auto Export, com GPS e FC) ganham aos nativos que comecem no mesmo minuto. */
export function mergeWorkouts(existing: Workout[] | null | undefined, incoming: Workout[]): Workout[] {
  const out = [...(existing ?? [])];
  const near = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 3 * 60000;
  for (const w of incoming) if (!out.some((e) => (e.id && e.id === w.id) || near(e.start, w.start))) out.push(w);
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}
