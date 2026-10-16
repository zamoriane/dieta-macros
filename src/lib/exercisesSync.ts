import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { toExerciseRow, WGER_BASE, type ExerciseRow, type WgerExerciseInfo } from "@/lib/wger";

const PAGE = 100;
export const STALE_DAYS = 30;

async function page(offset: number): Promise<{ count: number; results: WgerExerciseInfo[] }> {
  const r = await fetch(`${WGER_BASE}/api/v2/exerciseinfo/?format=json&limit=${PAGE}&offset=${offset}`, {
    headers: { Accept: "application/json", "User-Agent": "DietaMacros/1.0 (+https://takingcare.pt)" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`wger ${r.status}`);
  return r.json();
}

/** Descarrega o catálogo da wger (≈ 930 exercícios, 10 pedidos em paralelo) e grava a versão compacta. */
export async function syncExercises(): Promise<number> {
  const first = await page(0);
  const offsets: number[] = [];
  for (let o = PAGE; o < first.count; o += PAGE) offsets.push(o);
  const rest = await Promise.all(offsets.map(page));
  const rows = [first, ...rest]
    .flatMap((p) => p.results)
    .map(toExerciseRow)
    .filter((r): r is ExerciseRow => !!r)
    .map((r) => ({ ...r, atualizado_em: new Date().toISOString() }));
  const sb = createAdminClient();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("exercises").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

/** Estado do catálogo: vazio, desatualizado ou ok. */
export async function catalogState(): Promise<"vazio" | "antigo" | "ok"> {
  const { data } = await createAdminClient().from("exercises").select("atualizado_em").order("atualizado_em", { ascending: false }).limit(1);
  const last = data?.[0]?.atualizado_em as string | undefined;
  if (!last) return "vazio";
  return Date.now() - new Date(last).getTime() > STALE_DAYS * 86400_000 ? "antigo" : "ok";
}
