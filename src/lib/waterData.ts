"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, computeDay, getActivityDays, avgOuraActive, getHealthDays, latestWeight, type Profile } from "@/lib/data";
import { waterReference } from "@/lib/nutrition";
import { drinkFactor, effectiveMl, type WaterConfig } from "@/lib/water";

export type WaterLog = { id: number; dia: string; hora: string; ml: number; bebida: string; fator: number };

export async function getWaterLogs(sb: SupabaseClient, owner: string, from: string, to: string): Promise<WaterLog[]> {
  const { data, error } = await sb
    .from("water_logs")
    .select("id, dia, hora, ml, bebida, fator")
    .eq("user_id", owner)
    .gte("dia", from)
    .lte("dia", to)
    .order("hora");
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, ml: Number(r.ml), fator: Number(r.fator) })) as WaterLog[];
}

export async function addWater(sb: SupabaseClient, dia: string, ml: number, bebida: string): Promise<WaterLog> {
  const row: Record<string, unknown> = { dia, ml: Math.round(ml), bebida, fator: drinkFactor(bebida) };
  // Dias passados: regista ao meio-dia desse dia (não "agora"), para não baralhar o gráfico por hora
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (dia !== iso) row.hora = new Date(dia + "T12:00:00").toISOString();
  const { data, error } = await sb.from("water_logs").insert(row).select("id, dia, hora, ml, bebida, fator").single();
  if (error) throw error;
  return { ...data, ml: Number(data.ml), fator: Number(data.fator) } as WaterLog;
}

export async function deleteWater(sb: SupabaseClient, id: number) {
  const { error } = await sb.from("water_logs").delete().eq("id", id);
  if (error) throw error;
}

export async function saveWaterConfig(sb: SupabaseClient, owner: string, cfg: WaterConfig) {
  const { error } = await sb.from("profiles").update({ agua: cfg }).eq("id", owner);
  if (error) throw error;
}

/** Totais efetivos (mL que contam como água) por dia. */
export function totalsByDay(logs: WaterLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) m.set(l.dia, (m.get(l.dia) ?? 0) + effectiveMl(l.ml, l.fator));
  return m;
}

/**
 * Referência automática de bebidas (L) para um dia, igual à do ecrã Hoje:
 * gasto energético do dia + minutos de treino (sem depender do que se comeu).
 */
export async function autoWaterLiters(sb: SupabaseClient, p: Profile, dia: string, isToday: boolean): Promise<number | null> {
  const src = p.fonte_atividade ?? "oura";
  const [w, act, avg, hd] = await Promise.all([
    latestWeight(sb, dia),
    getActivityDays(sb, dia, dia, src),
    isToday ? avgOuraActive(sb, dia, 14, src) : Promise.resolve(null),
    getHealthDays(sb, dia, dia),
  ]);
  const zero = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const calc = computeDay(p, w?.kg ?? null, zero, act[0] ?? null, dia, { isToday, avgActive: avg });
  const h = hd[0];
  const workoutMin = (h?.workouts ?? []).reduce((s, x) => s + (x.min ?? 0), 0) || h?.exercise_min || 0;
  return waterReference({ sex: p.sexo, expenditureKcal: calc?.balance.expenditure, exerciseMin: workoutMin }).drinks;
}

export { addDays };
