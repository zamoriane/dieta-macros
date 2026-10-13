import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { search, toFoodRow } from "@/lib/calorieapi";

// Busca primeiro na base local (alimentos próprios + cache), depois na Calorie API.
// Resultados da API são gravados na cache para não gastar quota da próxima vez.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ foods: [] });

  const supabase = await createClient();
  const { data: local } = await supabase
    .from("foods")
    .select("*")
    .ilike("name", `%${q.replace(/[%_]/g, "")}%`)
    .order("user_id", { ascending: true, nullsFirst: false })
    .limit(10);

  let remote: unknown[] = [];
  let apiError: string | null = null;
  if (req.nextUrl.searchParams.get("local") !== "1") {
    try {
      const apiFoods = await search(q, 15);
      if (apiFoods.length) {
        const { data, error } = await createAdminClient()
          .from("foods")
          .upsert(apiFoods.map(toFoodRow), { onConflict: "source,external_id" })
          .select("*");
        if (error) throw error;
        remote = data ?? [];
      }
    } catch (e) {
      apiError = e instanceof Error ? e.message : String(e);
    }
  }

  const seen = new Set<number>();
  const foods = [...(local ?? []), ...remote].filter((f) => {
    const id = (f as { id: number }).id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return NextResponse.json({ foods, apiError });
}
