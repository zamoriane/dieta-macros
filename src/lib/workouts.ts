"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MuscleRef } from "@/lib/wger";

export type Exercise = {
  id: number;
  nome: string;
  nome_pt: string | null;
  nome_en: string | null;
  categoria: string | null;
  musculos: MuscleRef[];
  equipamento: string[];
  imagem: string | null;
  imagem_thumb: string | null;
  descricao?: string | null;
  autor?: string | null;
  licenca?: string | null;
};

export type WorkoutDay = { id: number; user_id: string; nome: string; dias_semana: number[]; notas: string | null; posicao: number };

export type WorkoutExercise = {
  id: number;
  workout_day_id: number;
  exercise_id: number | null;
  nome: string;
  imagem: string | null;
  series: number | null;
  reps: string | null;
  carga_kg: number | null;
  descanso_s: number | null;
  notas: string | null;
  posicao: number;
};

export type WorkoutLog = {
  id: number;
  dia: string;
  workout_day_id: number | null;
  workout_exercise_id: number | null;
  nome: string;
  serie: number;
  reps: number | null;
  carga_kg: number | null;
  feito_em: string;
};

export type Params = { series: number | null; reps: string | null; carga_kg: number | null; descanso_s: number | null; notas: string | null };

export async function getWorkout(sb: SupabaseClient, owner: string): Promise<{ days: WorkoutDay[]; exercises: WorkoutExercise[] }> {
  const [{ data: d, error: e1 }, { data: x, error: e2 }] = await Promise.all([
    sb.from("workout_days").select("id, user_id, nome, dias_semana, notas, posicao").eq("user_id", owner).order("posicao").order("id"),
    sb
      .from("workout_exercises")
      .select("id, workout_day_id, exercise_id, nome, imagem, series, reps, carga_kg, descanso_s, notas, posicao")
      .eq("user_id", owner)
      .order("posicao")
      .order("id"),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  return {
    days: (d ?? []) as WorkoutDay[],
    exercises: ((x ?? []) as WorkoutExercise[]).map((e) => ({ ...e, carga_kg: e.carga_kg == null ? null : Number(e.carga_kg) })),
  };
}

/** Séries registadas desde `from` (inclusive), mais recentes primeiro. */
export async function getLogs(sb: SupabaseClient, owner: string, from: string): Promise<WorkoutLog[]> {
  const { data } = await sb
    .from("workout_logs")
    .select("id, dia, workout_day_id, workout_exercise_id, nome, serie, reps, carga_kg, feito_em")
    .eq("user_id", owner)
    .gte("dia", from)
    .order("dia", { ascending: false })
    .order("serie");
  return ((data ?? []) as WorkoutLog[]).map((l) => ({ ...l, carga_kg: l.carga_kg == null ? null : Number(l.carga_kg) }));
}

/** Última sessão (dia) de cada exercício do plano, excluindo um dia (normalmente hoje). */
export function lastSessions(logs: WorkoutLog[], exceptDay?: string): Map<number, { dia: string; sets: WorkoutLog[] }> {
  const out = new Map<number, { dia: string; sets: WorkoutLog[] }>();
  for (const l of logs) {
    if (!l.workout_exercise_id || l.dia === exceptDay) continue;
    const cur = out.get(l.workout_exercise_id);
    if (!cur) out.set(l.workout_exercise_id, { dia: l.dia, sets: [l] });
    else if (cur.dia === l.dia) cur.sets.push(l);
  }
  for (const v of out.values()) v.sets.sort((a, b) => a.serie - b.serie);
  return out;
}

export function setsSummary(sets: WorkoutLog[]): string {
  const parts = sets.map((s) => `${s.reps ?? "?"}${s.carga_kg != null ? ` × ${s.carga_kg} kg` : ""}`);
  // Agrupa séries iguais: "3 × 10 × 40 kg"
  if (parts.length > 1 && parts.every((p) => p === parts[0])) return `${parts.length} × ${parts[0]}`;
  return parts.join(", ");
}

export async function searchExercises(q: string, cat: string | null): Promise<{ exercises: Exercise[]; error?: string }> {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (cat) sp.set("cat", cat);
  const r = await fetch(`/api/exercises?${sp}`);
  const j = await r.json().catch(() => ({ exercises: [], error: `Erro ${r.status}` }));
  return j;
}

export async function getExercise(id: number): Promise<Exercise | null> {
  const r = await fetch(`/api/exercises?id=${id}`);
  if (!r.ok) return null;
  return (await r.json()).exercise ?? null;
}
