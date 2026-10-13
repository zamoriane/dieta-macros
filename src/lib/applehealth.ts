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
  workouts?: Workout[];
};

/** Treino resumido. `route` = [lat, lon] simplificado (≤ 400 pontos), 5 casas decimais (~1 m). */
export type Workout = {
  id?: string;
  name: string;
  start: string;
  end?: string;
  min: number | null;
  kcal: number | null;
  km?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  route?: [number, number][];
};

type Point = Record<string, unknown> & { date?: string; qty?: unknown };
type Metric = { name?: string; units?: string; data?: Point[] };
type RawWorkout = Record<string, unknown>;

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
function energyField(w: RawWorkout): number | null {
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
  const workouts = ((root as { workouts?: unknown })?.workouts ?? []) as RawWorkout[];

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
    const h = day(d);
    h.workouts = h.workouts ?? [];
    const parsed = parseWorkout(w);
    // Evita duplicados quando a mesma janela é reenviada
    if (parsed.id && h.workouts.some((x) => x.id === parsed.id)) continue;
    h.workouts.push(parsed);
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


// ---------------------------------------------------------------------------
// Treinos e rotas GPS
// ---------------------------------------------------------------------------

const toTitle = (code: string) => code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function qtyOf(v: unknown): { qty: number; units?: string } | null {
  if (v == null) return null;
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as { qty?: unknown; units?: string };
    const q = num(o.qty);
    return q != null ? { qty: q, units: o.units } : null;
  }
  const q = num(v);
  return q != null ? { qty: q } : null;
}

function toKm(q: { qty: number; units?: string }): number {
  const u = (q.units ?? "km").toLowerCase();
  if (u === "m") return q.qty / 1000;
  if (u === "mi") return q.qty * 1.609344;
  if (u === "yd") return q.qty * 0.0009144;
  return q.qty;
}

/** Distância entre dois pontos (km), fórmula de haversine. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function routeKm(pts: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineKm(pts[i - 1], pts[i]);
  return d;
}

/** Simplificação Douglas-Peucker (tolerância em graus ≈ metros/111000). */
export function simplify(pts: [number, number][], tolerance = 0.00003): [number, number][] {
  if (pts.length <= 2) return pts;
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    const [ax, ay] = pts[first];
    const [bx, by] = pts[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = pts[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sqTol && idx > 0) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function parseWorkout(w: RawWorkout): Workout {
  const acts = Array.isArray(w.activities) ? (w.activities as RawWorkout[]) : [];
  const act = acts[0] ?? {};
  const metrics = (act.metrics ?? {}) as Record<string, unknown>;

  const name =
    typeof w.name === "string" && w.name
      ? w.name
      : typeof act.activityType === "string"
        ? toTitle(act.activityType)
        : "Treino";

  const dur = num(w.duration) ?? num(act.duration);
  let kcal = energyField(w);
  if (kcal == null) {
    const e = qtyOf(metrics.activeEnergy);
    if (e) kcal = Math.round(toKcal(e.qty, e.units));
  }

  // Rota: pontos com latitude/longitude, descartando leituras muito imprecisas (> 50 m)
  const rawRoute = Array.isArray(w.route) ? (w.route as Record<string, unknown>[]) : [];
  const full: [number, number][] = [];
  for (const p of rawRoute) {
    const lat = num(p.latitude ?? p.lat);
    const lon = num(p.longitude ?? p.lon ?? p.lng);
    const acc = num(p.horizontalAccuracy);
    if (lat == null || lon == null) continue;
    if (acc != null && acc > 50) continue;
    full.push([lat, lon]);
  }
  let route = full.length > 1 ? simplify(full) : undefined;
  if (route && route.length > 400) {
    const step = Math.ceil(route.length / 400);
    route = route.filter((_, i) => i % step === 0 || i === route!.length - 1);
  }
  route = route?.map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5] as [number, number]);

  const distQ = qtyOf(w.distance) ?? qtyOf(metrics.distanceWalkingRunning) ?? qtyOf(metrics.distance);
  const km = distQ ? Math.round(toKm(distQ) * 100) / 100 : full.length > 1 ? Math.round(routeKm(full) * 100) / 100 : null;

  const avg = qtyOf(w.avgHeartRate) ?? qtyOf(w.averageHeartRate) ?? qtyOf(metrics.heartRateAverage);
  const max = qtyOf(w.maxHeartRate) ?? qtyOf(metrics.heartRateMaximum);

  return {
    id: typeof w.id === "string" ? w.id : typeof act.id === "string" ? act.id : undefined,
    name,
    start: String(w.start),
    end: typeof w.end === "string" ? w.end : undefined,
    min: dur != null ? Math.round(dur > 600 ? dur / 60 : dur) : null,
    kcal,
    km: km && km > 0 ? km : null,
    avg_hr: avg ? Math.round(avg.qty) : null,
    max_hr: max ? Math.round(max.qty) : null,
    route: route && route.length > 1 ? route : undefined,
  };
}
