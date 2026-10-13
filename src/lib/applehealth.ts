// Parser do JSON enviado pela app Health Auto Export (iOS).
// Formato: { data: { metrics: [{ name, units, data: [{ date, qty, ... }] }], workouts: [...] } }
// Datas vêm no fuso do iPhone ("2026-10-13 14:30:00 +0100"): o dia é a parte YYYY-MM-DD.
// Sem dependências, para poder ser testado com `npm test`.

export type HealthDay = {
  dia: string;
  active_kcal?: number;
  basal_kcal?: number;
  steps?: number;
  exercise_min?: number;
  sleep_min?: number;
  resting_hr?: number;
  hrv_ms?: number;
  weight_kg?: number;
  workouts?: { name: string; start: string; min: number | null; kcal: number | null }[];
};

type Point = Record<string, unknown> & { date?: string; qty?: unknown };
type Metric = { name?: string; units?: string; data?: Point[] };
type Workout = Record<string, unknown>;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const dayOf = (date: unknown): string | null => {
  if (typeof date !== "string") return null;
  const m = date.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

/** Converte energia para kcal (a app pode estar configurada em kJ). */
export function toKcal(qty: number, units?: string): number {
  const u = (units ?? "kcal").toLowerCase();
  return u === "kj" ? qty / 4.184 : qty;
}

function toKg(qty: number, units?: string): number {
  const u = (units ?? "kg").toLowerCase();
  if (u === "lb" || u === "lbs") return qty * 0.45359237;
  if (u === "g") return qty / 1000;
  return qty;
}

/** Energia de um treino: aceita {qty, units} ou número. */
function energyField(w: Workout): number | null {
  for (const key of ["activeEnergyBurned", "activeEnergy", "totalEnergy", "totalEnergyBurned"]) {
    const v = w[key];
    if (v == null) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const o = v as { qty?: unknown; units?: string };
      const q = num(o.qty);
      if (q != null) return Math.round(toKcal(q, o.units));
    }
    if (Array.isArray(v)) {
      // v1: série de pontos {qty, units}
      const total = v.reduce((s, p) => s + (num((p as Point).qty) ?? 0), 0);
      const units = (v[0] as { units?: string } | undefined)?.units;
      if (total > 0) return Math.round(toKcal(total, units));
    }
    const q = num(v);
    if (q != null) return Math.round(q);
  }
  return null;
}

export type ParseResult = { days: HealthDay[]; metricNames: string[]; workouts: number; points: number };

export function parseHealthAutoExport(payload: unknown): ParseResult {
  const root = (payload as { data?: unknown })?.data ?? payload;
  const metrics = ((root as { metrics?: unknown })?.metrics ?? []) as Metric[];
  const workouts = ((root as { workouts?: unknown })?.workouts ?? []) as Workout[];

  const byDay = new Map<string, HealthDay>();
  const day = (d: string) => {
    if (!byDay.has(d)) byDay.set(d, { dia: d });
    return byDay.get(d)!;
  };
  // Acumuladores para médias
  const avg = new Map<string, { s: number; n: number }>();
  const addAvg = (key: string, v: number) => {
    const a = avg.get(key) ?? { s: 0, n: 0 };
    a.s += v;
    a.n += 1;
    avg.set(key, a);
  };

  let points = 0;
  const names: string[] = [];

  for (const m of Array.isArray(metrics) ? metrics : []) {
    const name = String(m.name ?? "").toLowerCase();
    names.push(name);
    for (const p of m.data ?? []) {
      const d = dayOf(p.date ?? p.sleepEnd ?? p.endDate);
      if (!d) continue;
      points++;
      const q = num(p.qty);
      const h = day(d);
      switch (name) {
        case "active_energy":
        case "active_energy_burned":
          if (q != null) h.active_kcal = (h.active_kcal ?? 0) + toKcal(q, m.units);
          break;
        case "basal_energy_burned":
        case "resting_energy":
          if (q != null) h.basal_kcal = (h.basal_kcal ?? 0) + toKcal(q, m.units);
          break;
        case "step_count":
        case "steps":
          if (q != null) h.steps = (h.steps ?? 0) + q;
          break;
        case "apple_exercise_time":
          if (q != null) h.exercise_min = (h.exercise_min ?? 0) + q;
          break;
        case "resting_heart_rate":
          if (q != null) addAvg(`${d}|rhr`, q);
          break;
        case "heart_rate_variability":
        case "heart_rate_variability_sdnn":
          if (q != null) addAvg(`${d}|hrv`, q);
          break;
        case "weight_body_mass":
        case "body_mass":
        case "weight":
          if (q != null) h.weight_kg = Math.round(toKg(q, m.units) * 100) / 100; // último do dia
          break;
        case "sleep_analysis": {
          // v2 agregado: totalSleep (h); v1: asleep (h); senão qty (h)
          const hours = num(p.totalSleep) ?? num(p.asleep) ?? q;
          if (hours != null) h.sleep_min = (h.sleep_min ?? 0) + Math.round(hours * 60);
          break;
        }
      }
    }
  }

  for (const [key, a] of avg) {
    const [d, kind] = key.split("|");
    const v = Math.round((a.s / a.n) * 10) / 10;
    if (kind === "rhr") day(d).resting_hr = v;
    else day(d).hrv_ms = v;
  }

  let wCount = 0;
  for (const w of Array.isArray(workouts) ? workouts : []) {
    const d = dayOf(w.start);
    if (!d) continue;
    wCount++;
    const dur = num(w.duration);
    const h = day(d);
    h.workouts = h.workouts ?? [];
    h.workouts.push({
      name: String(w.name ?? "Treino"),
      start: String(w.start),
      // duration vem em segundos na v2
      min: dur != null ? Math.round(dur > 600 ? dur / 60 : dur) : null,
      kcal: energyField(w),
    });
  }

  const days = [...byDay.values()]
    .map((h) => ({
      ...h,
      active_kcal: h.active_kcal != null ? Math.round(h.active_kcal) : undefined,
      basal_kcal: h.basal_kcal != null ? Math.round(h.basal_kcal) : undefined,
      steps: h.steps != null ? Math.round(h.steps) : undefined,
      exercise_min: h.exercise_min != null ? Math.round(h.exercise_min) : undefined,
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));

  return { days, metricNames: [...new Set(names)], workouts: wCount, points };
}
