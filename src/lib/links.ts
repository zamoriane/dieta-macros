"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageKey } from "@/lib/i18n/core";

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
  outra_avatar?: string | null;
};

export async function myLinks(sb: SupabaseClient): Promise<Link[]> {
  const { data, error } = await sb.rpc("my_links");
  if (error) throw error;
  return (data ?? []) as Link[];
}

// Mensagens RAISE do banco (em português) → chaves de tradução
const DB_ERRORS: Record<string, MessageKey> = {
  "Código de treinador inválido": "dberr.codigoInvalido",
  "Não se pode ligar a si próprio": "dberr.siProprio",
  "Ligação não encontrada": "dberr.ligacaoNaoEncontrada",
  "Pedido não encontrado": "dberr.pedidoNaoEncontrado",
  "Sessão inválida": "dberr.sessaoInvalida",
  "Exercício não pertence ao seu plano": "dberr.exercicioAlheio",
  "Registo pai não encontrado": "dberr.registoPai",
  "Sem permissão para alterar o estado do pedido de treinador": "dberr.semPermissao",
  "Sem permissão para alterar papel, estado ou código de treinador": "dberr.semPermissao",
};

/** Mensagens do banco (RAISE) para texto legível, traduzido quando conhecido. */
export function rpcError(e: unknown, t?: (k: MessageKey) => string): string {
  const msg = ((e as { message?: string })?.message ?? String(e)).replace(/^.*?ERROR:\s*/, "");
  const k = DB_ERRORS[msg.trim()];
  return k && t ? t(k) : msg;
}
