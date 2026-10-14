"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Measurement, MeasureKey } from "@/lib/body";

export async function getMeasurements(sb: SupabaseClient, owner: string, from?: string): Promise<Measurement[]> {
  let q = sb.from("body_measurements").select("dia, cintura, anca, pescoco, peito, braco, coxa, notas").eq("user_id", owner);
  if (from) q = q.gte("dia", from);
  const { data, error } = await q.order("dia");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const out: Measurement = { dia: r.dia as string, notas: r.notas as string | null };
    for (const k of ["cintura", "anca", "pescoco", "peito", "braco", "coxa"] as MeasureKey[]) {
      const v = (r as Record<string, unknown>)[k];
      out[k] = v == null ? null : Number(v);
    }
    return out;
  });
}

/** Grava as medidas de um dia, juntando às que já existirem nesse dia (campos vazios não apagam). */
export async function saveMeasurements(sb: SupabaseClient, owner: string, dia: string, values: Partial<Record<MeasureKey, number>>) {
  const { error } = await sb.from("body_measurements").upsert({ user_id: owner, dia, ...values }, { onConflict: "user_id,dia" });
  if (error) throw error;
}
