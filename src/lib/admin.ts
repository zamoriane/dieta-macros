import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Garante que quem chama é um admin ativo. Devolve o id do admin ou uma resposta de erro. */
export async function requireAdmin(): Promise<{ adminId: string } | { error: NextResponse }> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "não autenticado" }, { status: 401 }) };
  const { data } = await createAdminClient().from("profiles").select("role, ativo").eq("id", user.id).single();
  if (!data || data.role !== "admin" || !data.ativo) return { error: NextResponse.json({ error: "acesso reservado ao administrador" }, { status: 403 }) };
  return { adminId: user.id };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I

/** Código de treinador legível, ex.: PT-7K3Q9 */
export function newTrainerCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return "PT-" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function audit(actor: string, target: string | null, acao: string, detalhe: Record<string, unknown> = {}) {
  await createAdminClient().from("admin_audit").insert({ actor, target, acao, detalhe });
}
