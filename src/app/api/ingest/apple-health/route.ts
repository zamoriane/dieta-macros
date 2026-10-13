import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { parseHealthAutoExport } from "@/lib/applehealth";

// Recebe os envios da app Health Auto Export (iPhone).
// Autenticação: header "Authorization: Bearer <token>" (ou "x-api-key: <token>"), token visível no Perfil.
export const maxDuration = 30;

function tokenFrom(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key")?.trim() || null;
}

export async function POST(req: NextRequest) {
  const token = tokenFrom(req);
  if (!token || token.length < 20) return NextResponse.json({ error: "token em falta" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("ingest_token", token).maybeSingle();
  if (!profile) return NextResponse.json({ error: "token inválido" }, { status: 401 });
  const userId = profile.id as string;

  const text = await req.text();
  const log = async (resumo: Record<string, unknown>) => {
    await admin.from("health_ingest_log").insert({ user_id: userId, bytes: text.length, resumo, amostra: { inicio: text.slice(0, 4000) } });
    // Mantém só os últimos 20 registos
    const { data: old } = await admin
      .from("health_ingest_log")
      .select("id")
      .eq("user_id", userId)
      .order("recebido_em", { ascending: false })
      .range(20, 200);
    if (old?.length) await admin.from("health_ingest_log").delete().in("id", old.map((o) => o.id));
  };

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    await log({ erro: "JSON inválido (o formato na app deve ser JSON)" });
    return NextResponse.json({ error: "JSON inválido (configure o formato JSON na app)" }, { status: 400 });
  }

  try {
    const parsed = parseHealthAutoExport(payload);
    const now = new Date().toISOString();
    const erros: string[] = [];

    // Um upsert por dia, só com os campos presentes, para um envio parcial não apagar outros dados.
    for (const d of parsed.days) {
      const row: Record<string, unknown> = { user_id: userId, dia: d.dia, atualizado_em: now };
      for (const [k, v] of Object.entries(d)) if (v !== undefined && k !== "dia") row[k] = v;
      const { error } = await admin.from("health_daily").upsert(row, { onConflict: "user_id,dia" });
      if (error) erros.push(`${d.dia}: ${error.message}`);
      if (d.weight_kg && d.weight_kg > 20 && d.weight_kg < 400) {
        await admin.from("weights").upsert({ user_id: userId, dia: d.dia, kg: d.weight_kg }, { onConflict: "user_id,dia" });
      }
    }

    const resumo = {
      dias: parsed.days.map((d) => d.dia),
      metricas: parsed.metricNames,
      treinos: parsed.workouts,
      pontos: parsed.points,
      ...(erros.length ? { erro: erros.slice(0, 3).join(" | ") } : {}),
    };
    await log(resumo);
    return NextResponse.json({ ok: erros.length === 0, ...resumo }, { status: erros.length ? 500 : 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log({ erro: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
