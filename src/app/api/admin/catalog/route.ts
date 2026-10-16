import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { audit, requireAdmin } from "@/lib/admin";
import { readXlsx } from "@/lib/xlsx";
import { diffCatalog, parseCatalog, type CatalogSource, type ExistingRow } from "@/lib/foodCatalog";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;

type Admin = ReturnType<typeof createAdminClient>;

/** Todas as linhas de uma fonte (o PostgREST devolve no máximo 1000 de cada vez). */
async function existingRows(admin: Admin, source: CatalogSource) {
  const out: (ExistingRow & { id: number })[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("foods")
      .select("id, external_id, name, grupo, unidade, ativo, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g")
      .eq("source", source)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as (ExistingRow & { id: number })[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Quantos planos (utilizadores) usam alimentos que vão mudar ou ficar inativos. */
async function plansAffected(admin: Admin, foodIds: number[]) {
  const users = new Set<string>();
  for (let i = 0; i < foodIds.length; i += 200) {
    const { data } = await admin.from("plan_items").select("user_id").in("food_id", foodIds.slice(i, i + 200));
    for (const r of data ?? []) users.add(r.user_id as string);
  }
  return users.size;
}

// Estado do catálogo e histórico de importações
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admin = createAdminClient();
  const fontes = await Promise.all(
    (["insa", "taco"] as const).map(async (source) => {
      const [{ count: ativos }, { count: inativos }, { data: ult }] = await Promise.all([
        admin.from("foods").select("id", { count: "exact", head: true }).eq("source", source).eq("ativo", true),
        admin.from("foods").select("id", { count: "exact", head: true }).eq("source", source).eq("ativo", false),
        admin.from("foods").select("versao").eq("source", source).eq("ativo", true).limit(1),
      ]);
      return { source, ativos: ativos ?? 0, inativos: inativos ?? 0, versao: (ult?.[0]?.versao as string | undefined) ?? null };
    }),
  );
  const { data: historico, error } = await admin.from("food_imports").select("*").order("em", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: error.message, migracao: true }, { status: 500 });
  return NextResponse.json({ fontes, historico });
}

// modo=previa: lê o Excel e mostra as diferenças (não grava nada)
// modo=importar: grava tudo de uma vez (função import_food_catalog)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("ficheiro");
  const modo = form?.get("modo") === "importar" ? "importar" : "previa";
  if (!(file instanceof File)) return NextResponse.json({ error: "Escolha o ficheiro Excel." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Ficheiro demasiado grande (máx. 10 MB)." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "O ficheiro tem de ser .xlsx." }, { status: 400 });

  let parsed;
  try {
    parsed = parseCatalog(readXlsx(new Uint8Array(await file.arrayBuffer())));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
  if (!parsed.rows.length) return NextResponse.json({ error: "O Excel não tem alimentos válidos. Nada foi importado." }, { status: 422 });

  const versaoForm = String(form?.get("versao") ?? "").trim().slice(0, 40);
  const versao = versaoForm || parsed.versao;
  const admin = createAdminClient();

  let existing;
  try {
    existing = await existingRows(admin, parsed.source);
  } catch (e) {
    return NextResponse.json({ error: `Base de dados: ${e instanceof Error ? e.message : e}. A migração 0013 já foi executada?` }, { status: 500 });
  }
  const diff = diffCatalog(existing, parsed.rows);

  if (modo === "previa") {
    const idByExt = new Map(existing.map((e) => [Number(e.external_id), e.id]));
    const touched = [...diff.idsAlterados, ...diff.idsInativados].map((x) => idByExt.get(x)).filter((x): x is number => x != null);
    const { idsAlterados: _a, idsInativados: _b, ...resumo } = diff;
    return NextResponse.json({
      source: parsed.source,
      versao,
      versaoDetetada: parsed.versao,
      notas: parsed.notas,
      ignorados: parsed.ignored,
      planosAfetados: touched.length ? await plansAffected(admin, touched) : 0,
      ...resumo,
    });
  }

  const { data, error } = await admin.rpc("import_food_catalog", {
    p_fonte: parsed.source,
    p_versao: versao,
    p_ficheiro: file.name.slice(0, 200),
    p_actor: auth.adminId,
    p_rows: parsed.rows,
    p_ignorados: parsed.ignored.length,
  });
  if (error) return NextResponse.json({ error: `Importação cancelada, nada foi alterado: ${error.message}` }, { status: 500 });
  await audit(auth.adminId, null, "importar_catalogo", { fonte: parsed.source, versao, ficheiro: file.name, resultado: data });
  return NextResponse.json({ ok: true, source: parsed.source, versao, resultado: data, ignorados: parsed.ignored.length });
}
