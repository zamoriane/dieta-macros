import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";

// Apaga a conta do próprio utilizador e todos os seus dados (exigido pela App Store e pela Google Play).
// As tabelas ligam-se a auth.users com "on delete cascade"; as fotos do Storage são apagadas à parte.
export async function POST(req: NextRequest) {
  const { t } = await getT();
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: t("dberr.sessaoInvalida") }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if ((body.confirm ?? "").trim().toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: t("apagar.err.confirmacao") }, { status: 400 });
  }

  const admin = createAdminClient();

  // Não deixar a aplicação sem administrador
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role === "admin") {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("ativo", true);
    if ((count ?? 0) <= 1) return NextResponse.json({ error: t("apagar.err.ultimoAdmin") }, { status: 400 });
  }

  // Fotos de perfil
  const { data: files } = await admin.storage.from("avatars").list(user.id);
  if (files?.length) await admin.storage.from("avatars").remove(files.map((f) => `${user.id}/${f.name}`));

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
