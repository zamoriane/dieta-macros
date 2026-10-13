"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Link = {
  id: number;
  papel: "cliente" | "treinador"; // o MEU papel nesta ligação
  outra_id: string;
  outra_nome: string | null;
  outra_email: string | null;
  status: "pendente" | "ativo";
  perm_dieta: boolean;
  perm_treino: boolean;
  perm_progresso: boolean;
  criado_em: string;
  aceite_em: string | null;
};

export async function myLinks(sb: SupabaseClient): Promise<Link[]> {
  const { data, error } = await sb.rpc("my_links");
  if (error) throw error;
  return (data ?? []) as Link[];
}

/** Mensagens do banco (RAISE) para texto legível. */
export function rpcError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  return msg.replace(/^.*?ERROR:\s*/, "");
}
