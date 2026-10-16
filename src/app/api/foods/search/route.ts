import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { search, toFoodRow } from "@/lib/calorieapi";
import { rankFoods, searchTerms } from "@/lib/foodCatalog";

type Row = { id: number; name: string; source: string; nome_busca?: string | null };

// Pesquisa: 1) catálogo local — alimentos próprios, tabelas oficiais INSA/TACO e cache da Calorie API —
// por todas as palavras, sem acentos; 2) Calorie API só quando o catálogo devolve poucos resultados
// ou quando o utilizador pede mais (mais=1). Resultados da API ficam na cache.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const terms = searchTerms(q);
  if (q.length < 2 || !terms.length) return NextResponse.json({ foods: [] });
  const more = req.nextUrl.searchParams.get("mais") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  // Só alimentos partilhados (user_id nulo) e os próprios — não os de outras contas ligadas
  let query = supabase.from("foods").select("*").eq("ativo", true).or(`user_id.is.null,user_id.eq.${user.id}`);
  for (const w of terms) query = query.ilike("nome_busca", `%${w}%`);
  let { data: local, error } = await query.limit(80);
  if (error) {
    // Antes da migração 0013 (sem nome_busca/ativo): pesquisa antiga pelo nome
    ({ data: local } = await supabase
      .from("foods")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .ilike("name", `%${q.replace(/[%_,()]/g, "")}%`)
      .limit(20));
  }
  const ranked = rankFoods((local ?? []) as Row[], q).slice(0, 30);

  let remote: Row[] = [];
  let apiError: string | null = null;
  if (req.nextUrl.searchParams.get("local") !== "1" && (more || ranked.length < 8)) {
    try {
      const apiFoods = await search(q, 15);
      if (apiFoods.length) {
        const { data, error: upErr } = await createAdminClient()
          .from("foods")
          .upsert(apiFoods.map(toFoodRow), { onConflict: "source,external_id" })
          .select("*");
        if (upErr) throw upErr;
        remote = (data ?? []) as Row[];
      }
    } catch (e) {
      apiError = e instanceof Error ? e.message : String(e);
    }
  }

  const seen = new Set<number>();
  const foods = [...ranked, ...remote].filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
  return NextResponse.json({ foods, apiError, maisDisponivel: !more && remote.length === 0 && !apiError });
}
