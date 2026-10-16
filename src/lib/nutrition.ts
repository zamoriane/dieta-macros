// Cálculos de nutrição e balanço energético. Sem dependências: testável com `npm test`.

export type Macros = { kcal: number; protein: number; carbs: number; fat: number; fiber: number };

export type FoodPer100 = {
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g?: number | null;
};

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Macros de uma quantidade em gramas, a partir dos valores por 100 g. */
export function scale(food: FoodPer100, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: r1(Number(food.kcal_100g) * f),
    protein: r1(Number(food.protein_100g) * f),
    carbs: r1(Number(food.carbs_100g) * f),
    fat: r1(Number(food.fat_100g) * f),
    fiber: r1(Number(food.fiber_100g ?? 0) * f),
  };
}

export function sum(items: Partial<Macros>[]): Macros {
  const t = { ...ZERO };
  for (const i of items) {
    t.kcal += Number(i.kcal ?? 0);
    t.protein += Number(i.protein ?? 0);
    t.carbs += Number(i.carbs ?? 0);
    t.fat += Number(i.fat ?? 0);
    t.fiber += Number(i.fiber ?? 0);
  }
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat), fiber: r1(t.fiber) };
}

export function ageOn(birth: string, on: Date = new Date()): number {
  const b = new Date(birth + "T00:00:00");
  let age = on.getFullYear() - b.getFullYear();
  const m = on.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age--;
  return age;
}

/** Taxa metabólica basal — Mifflin-St Jeor (1990). */
export function bmrMifflin(sex: "M" | "F", kg: number, cm: number, age: number): number {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return Math.round(sex === "M" ? base + 5 : base - 161);
}

export type EnergyInput = {
  bmr: number;
  intakeKcal: number;
  ouraActiveKcal?: number | null;
  ouraTotalKcal?: number | null;
  activityCorrection: number; // ex.: 0.85
  manualActivityFactor: number; // ex.: 1.3, usado sem Oura
};

export type EnergyBalance = {
  bmr: number;
  activity: number;
  expenditure: number;
  intake: number;
  deficit: number; // positivo = défice (bom para emagrecer)
  source: "oura" | "estimativa";
  ouraTotal: number | null;
};

/**
 * Gasto do dia = TMB + atividade. Com Oura, usa active_calories × fator de correção
 * (wearables tendem a superestimar). O total_calories do Oura já inclui o basal,
 * por isso NÃO é somado à TMB — fica só como referência.
 */
export function energyBalance(i: EnergyInput): EnergyBalance {
  const hasOura = i.ouraActiveKcal != null;
  const activity = hasOura
    ? Math.round(Number(i.ouraActiveKcal) * i.activityCorrection)
    : Math.round(i.bmr * (i.manualActivityFactor - 1));
  const expenditure = i.bmr + activity;
  return {
    bmr: i.bmr,
    activity,
    expenditure,
    intake: Math.round(i.intakeKcal),
    deficit: expenditure - Math.round(i.intakeKcal),
    source: hasOura ? "oura" : "estimativa",
    ouraTotal: i.ouraTotalKcal ?? null,
  };
}

export type Targets = { kcal: number; protein: number; fat: number; carbs: number };

/** Metas do dia a partir do gasto estimado e do défice-alvo. */
export function dailyTargets(opts: {
  expenditure: number;
  deficit: number;
  weightKg: number;
  proteinPerKg: number;
  fatPct: number;
  minKcal: number;
}): Targets {
  const kcal = Math.max(opts.minKcal, Math.round(opts.expenditure - opts.deficit));
  const protein = Math.round(opts.weightKg * opts.proteinPerKg);
  const fat = Math.round((kcal * opts.fatPct) / 100 / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs };
}

/** Alerta com chave de tradução (ver alert.* em lib/i18n) e variáveis. */
export type Alert = { level: "info" | "aviso" | "alerta"; key: string; vars?: Record<string, number> };

/** Alertas mostrados ao abrir o app. `hour` é a hora local (0–23). */
export function buildAlerts(opts: {
  totals: Macros;
  targets: Targets;
  balance: EnergyBalance;
  hour: number;
  isToday: boolean;
  lowIntakeStreak: number; // dias seguidos anteriores abaixo do mínimo
  minKcal: number;
  hasWeightLast7d: boolean;
  sleepScore?: number | null;
  /** kcal do plano ainda por confirmar (planeado/legado) — os totais podem estar incompletos */
  pendingKcal?: number;
  /** o registo do dia está completo? (dias passados) */
  complete?: boolean;
}): Alert[] {
  const a: Alert[] = [];
  const { totals, targets, balance } = opts;

  if (totals.kcal > targets.kcal * 1.05) {
    a.push({ level: "alerta", key: "alert.kcalAcima", vars: { kcal: totals.kcal, meta: targets.kcal } });
  }
  const pending = opts.pendingKcal ?? 0;
  if (pending > 0 && (!opts.isToday || opts.hour >= 20)) {
    a.push({ level: "info", key: opts.isToday ? "alert.porConfirmar" : "alert.porConfirmarDia", vars: { kcal: Math.round(pending) } });
  }
  if (opts.isToday && opts.hour >= 18 && pending === 0 && totals.protein < targets.protein * 0.75) {
    a.push({
      level: "aviso",
      key: "alert.proteinaBaixa",
      vars: { p: totals.protein, meta: targets.protein, falta: Math.round(targets.protein - totals.protein) },
    });
  }
  if (!opts.isToday && opts.complete !== false && balance.deficit < 0) {
    a.push({ level: "aviso", key: "alert.excedente", vars: { kcal: -balance.deficit } });
  }
  if (opts.lowIntakeStreak >= 3) {
    a.push({ level: "alerta", key: "alert.ingestaoBaixa", vars: { dias: opts.lowIntakeStreak, min: opts.minKcal } });
  }
  if (!opts.hasWeightLast7d) {
    a.push({ level: "info", key: "alert.semPeso" });
  }
  if (opts.sleepScore != null && opts.sleepScore < 70) {
    a.push({ level: "info", key: "alert.sonoFraco", vars: { score: opts.sleepScore } });
  }
  return a;
}

/** Média móvel exponencial (suaviza a variação diária de água no peso). */
export function ema(values: number[], alpha = 0.1): number[] {
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : alpha * v + (1 - alpha) * out[i - 1]));
  return out;
}

export const KCAL_PER_KG = 7700;

/**
 * Gasto real estimado (TDEE adaptativo): ingestão média − variação de peso convertida em kcal.
 * Requer pelo menos 14 dias com peso e ingestão. Devolve null se não houver dados suficientes.
 */
export function adaptiveTdee(days: { intake: number | null; weight: number | null }[]): number | null {
  const withBoth = days.filter((d) => d.intake != null && d.weight != null);
  if (withBoth.length < 14) return null;
  const weights = ema(withBoth.map((d) => Number(d.weight)));
  const deltaKg = weights[weights.length - 1] - weights[0];
  const span = withBoth.length - 1;
  const avgIntake = withBoth.reduce((s, d) => s + Number(d.intake), 0) / withBoth.length;
  return Math.round(avgIntake - (deltaKg * KCAL_PER_KG) / span);
}

/**
 * Referência diária de água (informativa).
 * - EFSA (2010): ingestão adequada de água total 2,5 L/dia (homens) e 2,0 L/dia (mulheres);
 * - National Research Council (EUA): 1 mL por kcal de gasto energético;
 * - Exercício: + 0,5 L por hora (ACSM: perdas de suor típicas 0,5–2 L/h; valor conservador).
 * Água total inclui a dos alimentos (~20%); em bebidas ≈ 80% do total.
 */
export function waterReference(opts: { sex: "M" | "F" | null; expenditureKcal?: number | null; exerciseMin?: number | null }) {
  const efsa = opts.sex === "F" ? 2.0 : 2.5;
  const byEnergy = opts.expenditureKcal ? opts.expenditureKcal / 1000 : 0;
  const base = Math.max(efsa, byEnergy);
  const exercise = opts.exerciseMin ? (opts.exerciseMin / 60) * 0.5 : 0;
  const total = Math.round((base + exercise) * 10) / 10;
  const drinks = Math.round(total * 0.8 * 10) / 10;
  return { total, drinks, efsa, byEnergy: Math.round(byEnergy * 10) / 10, exercise: Math.round(exercise * 10) / 10 };
}
