import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { catalogState, syncExercises } from "@/lib/exercisesSync";
import { searchGroups } from "@/lib/wger";

export const maxDuration = 60;

const COLS = "id, nome, nome_pt, nome_en, categoria, musculos, equipamento, imagem, imagem_thumb";

// Pesquisa no catálogo local (cópia da wger). Na primeira utilização, ou se tiver mais de 30 dias,
// o catálogo é (re)descarregado da wger.
export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const state = await catalogState();
  if (state === "vazio") {
    try {
      await syncExercises();
    } catch (e) {
      return NextResponse.json({ exercises: [], error: `Não foi possível carregar os exercícios da wger: ${e instanceof Error ? e.message : e}` }, { status: 502 });
    }
  } else if (state === "antigo") {
    after(() => syncExercises().catch(() => undefined));
  }

  const sp = req.nextUrl.searchParams;
  const id = Number(sp.get("id"));
  if (id) {
    const { data } = await sb.from("exercises").select(`${COLS}, descricao, autor, licenca`).eq("id", id).maybeSingle();
    return NextResponse.json({ exercise: data });
  }

  let q = sb.from("exercises").select(COLS);
  const cat = sp.get("cat");
  if (cat) q = q.eq("categoria", cat);
  for (const g of searchGroups(sp.get("q") ?? "")) {
    q = q.or(g.map((t) => `busca.ilike."*${t}*"`).join(","));
  }
  const { data, error } = await q.order("rank").order("nome").limit(40);
  if (error) return NextResponse.json({ exercises: [], error: error.message }, { status: 500 });
  return NextResponse.json({ exercises: data ?? [] });
}
