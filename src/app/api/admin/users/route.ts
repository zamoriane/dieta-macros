import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

// Lista de utilizadores (Auth + perfil) para a página de administração.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admin = createAdminClient();

  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nome, role, ativo, pt_estado, pt_contacto_email, pt_pedido_em, trainer_code, criado_em");
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const users = list.users.map((u) => {
    const p = byId.get(u.id) ?? {};
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed: !!u.email_confirmed_at,
      ...p,
    };
  });
  users.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return NextResponse.json({ users, me: auth.adminId });
}
