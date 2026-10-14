import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { audit, newTrainerCode, requireAdmin } from "@/lib/admin";
import { getT } from "@/lib/i18n/server";

type Acao = "ativar" | "desativar" | "aprovar_pt" | "recusar_pt" | "remover_pt";
const ACOES: Acao[] = ["ativar", "desativar", "aprovar_pt", "recusar_pt", "remover_pt"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { acao } = (await req.json().catch(() => ({}))) as { acao?: Acao };
  if (!acao || !ACOES.includes(acao)) return NextResponse.json({ error: "ação inválida" }, { status: 400 });

  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("id, role, ativo, pt_estado, trainer_code").eq("id", id).single();
  if (!p) return NextResponse.json({ error: "utilizador não encontrado" }, { status: 404 });
  if (id === auth.adminId && (acao === "desativar" || acao === "remover_pt")) {
    return NextResponse.json({ error: (await getT()).t("admin.err.propria") }, { status: 400 });
  }

  let update: Record<string, unknown> = {};
  const detalhe: Record<string, unknown> = { antes: p };

  switch (acao) {
    case "desativar": {
      update = { ativo: false };
      // Bloqueia também o login e a renovação de sessão
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "ativar": {
      update = { ativo: true };
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "aprovar_pt": {
      let code = p.trainer_code as string | null;
      for (let i = 0; !code && i < 5; i++) {
        const c = newTrainerCode();
        const { data: clash } = await admin.from("profiles").select("id").eq("trainer_code", c).maybeSingle();
        if (!clash) code = c;
      }
      update = { pt_estado: "aprovado", trainer_code: code, role: p.role === "admin" ? "admin" : "treinador" };
      break;
    }
    case "recusar_pt":
      update = { pt_estado: "recusado" };
      break;
    case "remover_pt":
      update = { pt_estado: null, trainer_code: null, role: p.role === "admin" ? "admin" : "cliente" };
      break;
  }

  const { data: after, error } = await admin.from("profiles").update(update).eq("id", id).select("id, role, ativo, pt_estado, trainer_code").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  detalhe.depois = after;
  await audit(auth.adminId, id, acao, detalhe);
  return NextResponse.json({ ok: true, profile: after });
}
