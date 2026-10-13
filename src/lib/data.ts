"use client";
// Acesso a dados no navegador. Tudo passa por RLS: cada utilizador só vê o que é seu.
import type { SupabaseClient } from "@supabase/supabase-js";
import { scale, sum, ageOn, bmrMifflin, energyBalance, dailyTargets, type Macros } from "@/lib/nutrition";

export type Food = {
  id: number;
  user_id: string | null;
  source: "calorieapi" | "custom";
  name: string;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number;
  portions: { label: string; grams: number }[];
};

export type Profile = {
  id: string;
  nome: string | null;
  sexo: "M" | "F" | null;
  data_nascimento: string | null;
  altura_cm: number | null;
  peso_meta_kg: number | null;
  deficit_alvo_kcal: number;
  proteina_g_kg: number;
  gordura_pct: number;
  fator_correcao_atividade: number;
  fator_atividade_manual: number;
  kcal_minimo: number;
};

export type LogItem = {
  id: number;
  dia: string;
  refeicao: string;
  refeicao_pos: number;
  food_id: number | null;
  food_name: string;
  gramas: number;
  gramas_plano: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type PlanMeal = { id: number; nome: string; hora: string | null; posicao: number };
export type PlanItem = { id: number; plan_meal_id: number; food_id: number; gramas: number; posicao: number; foods: Food };

export type OuraDay = {
  dia: string;
  active_calories: number | null;
  total_calories: number | null;
  steps: number | null;
  sleep_score: number | null;
  readiness_score: number | null;
  stress_high_min: number | null;
  stress_summary: string | null;
};

/** Data local em YYYY-MM-DD. */
export function isoDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

export async function getUserId(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada");
  return data.user.id;
}

export async function getProfile(sb: SupabaseClient): Promise<Profile> {
  const { data, error } = await sb.from("profiles").select("*").single();
  if (error) throw error;
  return data as Profile;
}

/** Peso mais recente até à data indicada. */
export async function latestWeight(sb: SupabaseClient, until: string): Promise<{ dia: string; kg: number } | null> {
  const { data } = await sb.from("weights").select("dia,kg").lte("dia", until).order("dia", { ascending: false }).limit(1);
  return data?.[0] ? { dia: data[0].dia, kg: Number(data[0].kg) } : null;
}

export async function getPlan(sb: SupabaseClient): Promise<{ meals: PlanMeal[]; items: PlanItem[] }> {
  const [{ data: meals }, { data: items }] = await Promise.all([
    sb.from("plan_meals").select("*").order("posicao"),
    sb.from("plan_items").select("*, foods(*)").order("posicao"),
  ]);
  return { meals: (meals ?? []) as PlanMeal[], items: (items ?? []) as unknown as PlanItem[] };
}

/** Garante que o dia existe; na criação copia o plano base. Devolve true se acabou de criar. */
export async function ensureDay(sb: SupabaseClient, dia: string, copyPlan = true): Promise<boolean> {
  const { data: existing } = await sb.from("days").select("dia").eq("dia", dia).maybeSingle();
  if (existing) return false;
  const userId = await getUserId(sb);
  const { error } = await sb.from("days").insert({ user_id: userId, dia });
  if (error) {
    if (error.code === "23505") return false; // criado noutro separador
    throw error;
  }
  if (!copyPlan) return true;
  await applyPlanToDay(sb, dia);
  return true;
}

/** Copia os itens do plano base para o dia (usado na criação do dia ou num dia que ficou vazio). */
export async function applyPlanToDay(sb: SupabaseClient, dia: string): Promise<number> {
  const userId = await getUserId(sb);
  const { meals, items } = await getPlan(sb);
  const rows = items.map((it) => {
    const meal = meals.find((m) => m.id === it.plan_meal_id)!;
    const m = scale(it.foods, Number(it.gramas));
    return {
      user_id: userId,
      dia,
      refeicao: meal.nome,
      refeicao_pos: meal.posicao,
      food_id: it.food_id,
      food_name: it.foods.name,
      gramas: it.gramas,
      gramas_plano: it.gramas,
      ...m,
    };
  });
  if (rows.length) {
    const { error } = await sb.from("log_items").insert(rows);
    if (error) throw error;
  }
  return rows.length;
}

export async function getDayItems(sb: SupabaseClient, dia: string): Promise<LogItem[]> {
  const { data, error } = await sb.from("log_items").select("*").eq("dia", dia).order("refeicao_pos").order("id");
  if (error) throw error;
  return (data ?? []) as LogItem[];
}

export async function addLogItem(sb: SupabaseClient, dia: string, refeicao: string, pos: number, food: Food, gramas: number) {
  const userId = await getUserId(sb);
  await ensureDay(sb, dia, false);
  const { error } = await sb.from("log_items").insert({
    user_id: userId,
    dia,
    refeicao,
    refeicao_pos: pos,
    food_id: food.id,
    food_name: food.name,
    gramas,
    gramas_plano: null,
    ...scale(food, gramas),
  });
  if (error) throw error;
}

/** Altera a quantidade recalculando o snapshot a partir do alimento. */
export async function updateLogGrams(sb: SupabaseClient, item: LogItem, gramas: number) {
  let macros: Macros;
  if (item.food_id) {
    const { data: food } = await sb.from("foods").select("*").eq("id", item.food_id).single();
    macros = scale(food as Food, gramas);
  } else {
    const f = gramas / Number(item.gramas);
    macros = { kcal: item.kcal * f, protein: item.protein * f, carbs: item.carbs * f, fat: item.fat * f, fiber: item.fiber * f };
  }
  const { error } = await sb.from("log_items").update({ gramas, ...macros }).eq("id", item.id);
  if (error) throw error;
}

export async function getOuraDays(sb: SupabaseClient, from: string, to: string): Promise<OuraDay[]> {
  const { data } = await sb.from("oura_daily").select("*").gte("dia", from).lte("dia", to).order("dia");
  return (data ?? []) as OuraDay[];
}

export function profileComplete(p: Profile): boolean {
  return !!(p.sexo && p.data_nascimento && p.altura_cm);
}

/** Média das calorias ativas do Oura nos dias completos anteriores (null se houver menos de 3 dias). */
export async function avgOuraActive(sb: SupabaseClient, before: string, days = 14): Promise<number | null> {
  const { data } = await sb
    .from("oura_daily")
    .select("active_calories")
    .gte("dia", addDays(before, -days))
    .lt("dia", before)
    .not("active_calories", "is", null);
  const v = (data ?? []).map((r) => Number(r.active_calories)).filter((n) => n > 0);
  return v.length >= 3 ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/**
 * Junta perfil + peso + ingestão + Oura e devolve balanço e metas do dia.
 * Hoje: o Oura só tem a atividade ATÉ AGORA, por isso usa-se a previsão
 * (maior entre a média dos últimos 14 dias e o já acumulado). Assim a meta
 * não muda ao longo do dia e o défice não parece enorme de manhã.
 */
export function computeDay(
  p: Profile,
  weightKg: number | null,
  totals: Macros,
  oura: OuraDay | null,
  dia: string,
  opts: { isToday?: boolean; avgActive?: number | null } = {},
) {
  if (!profileComplete(p) || !weightKg) return null;
  const bmr = bmrMifflin(p.sexo!, weightKg, Number(p.altura_cm), ageOn(p.data_nascimento!, new Date(dia + "T12:00:00")));
  const live = oura?.active_calories ?? null;
  let active: number | null = live;
  let projected = false;
  if (opts.isToday) {
    active = live == null && opts.avgActive == null ? null : Math.max(live ?? 0, opts.avgActive ?? 0);
    projected = active != null && active !== live;
  }
  const balance = energyBalance({
    bmr,
    intakeKcal: totals.kcal,
    ouraActiveKcal: active,
    ouraTotalKcal: opts.isToday ? null : (oura?.total_calories ?? null),
    activityCorrection: Number(p.fator_correcao_atividade),
    manualActivityFactor: Number(p.fator_atividade_manual),
  });
  // Proteína calculada pelo peso-meta quando definido (mais adequado com excesso de peso)
  // (ignora valores implausíveis, ex.: "10" escrito como "perder 10 kg")
  const meta = Number(p.peso_meta_kg);
  const proteinBase = meta >= 40 && meta >= weightKg * 0.6 ? Math.min(meta, weightKg) : weightKg;
  const targets = dailyTargets({
    expenditure: balance.expenditure,
    deficit: p.deficit_alvo_kcal,
    weightKg: proteinBase,
    proteinPerKg: Number(p.proteina_g_kg),
    fatPct: p.gordura_pct,
    minKcal: p.kcal_minimo,
  });
  const liveActivity = live != null ? Math.round(live * Number(p.fator_correcao_atividade)) : null;
  return { bmr, balance, targets, projected, liveActivity };
}

export { sum };
