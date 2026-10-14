import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { mergeWorkouts, type DayRow } from "@/lib/nativeHealth";
import type { Workout } from "@/lib/applehealth";

// Recebe os dados lidos pela app nativa (Apple Saúde / Health Connect) do utilizador com sessão iniciada.
const NUM: (keyof DayRow)[] = ["active_kcal", "basal_kcal", "steps", "exercise_min", "sleep_min", "resting_hr", "hrv_ms", "weight_kg"];

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const userId = auth.user.id;

  const body = (await req.json().catch(() => null)) as { days?: DayRow[]; platform?: string } | null;
  const days = Array.isArray(body?.days) ? body!.days.slice(0, 62) : [];
  const minDay = new Date(Date.now() - 62 * 86400_000).toISOString().slice(0, 10);

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const valid = days.filter((d) => typeof d?.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.dia) && d.dia >= minDay);
  const { data: existing } = valid.length
    ? await admin.from("health_daily").select("dia, workouts").eq("user_id", userId).in("dia", valid.map((d) => d.dia))
    : { data: [] };
  const exBy = new Map<string, Workout[]>((existing ?? []).map((r) => [r.dia as string, (r.workouts ?? []) as Workout[]]));

  const erros: string[] = [];
  for (const d of valid) {
    const row: Record<string, unknown> = { user_id: userId, dia: d.dia, atualizado_em: now };
    for (const k of NUM) {
      const v = d[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) row[k] = v;
    }
    if (Array.isArray(d.workouts) && d.workouts.length) row.workouts = mergeWorkouts(exBy.get(d.dia), d.workouts.slice(0, 30));
    const { error } = await admin.from("health_daily").upsert(row, { onConflict: "user_id,dia" });
    if (error) erros.push(`${d.dia}: ${error.message}`);
    if (typeof d.weight_kg === "number" && d.weight_kg > 20 && d.weight_kg < 400) {
      await admin.from("weights").upsert({ user_id: userId, dia: d.dia, kg: d.weight_kg }, { onConflict: "user_id,dia" });
    }
  }

  await admin.from("health_ingest_log").insert({
    user_id: userId,
    bytes: JSON.stringify(body ?? {}).length,
    resumo: {
      fonte: body?.platform === "android" ? "health-connect" : "apple-saude",
      dias: valid.map((d) => d.dia),
      treinos: valid.reduce((s, d) => s + (d.workouts?.length ?? 0), 0),
      ...(erros.length ? { erro: erros.slice(0, 3).join(" | ") } : {}),
    },
  });
  return NextResponse.json({ ok: !erros.length, dias: valid.length }, { status: erros.length ? 500 : 200 });
}
