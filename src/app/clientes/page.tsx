"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProfile, type Profile } from "@/lib/data";
import { myLinks, rpcError, type Link as TLink } from "@/lib/links";
import { EmptyState, PageHeader, SectionCard, Skeleton, StatusBadge } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toast";

export default function ClientesPage() {
  const sb = useMemo(() => createClient(), []);
  const [me, setMe] = useState<Profile | null>(null);
  const [links, setLinks] = useState<TLink[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([getProfile(sb), myLinks(sb).catch(() => [] as TLink[])]);
    setMe(p);
    setLinks(l.filter((x) => x.papel === "treinador"));
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(l: TLink, accept: boolean) {
    const { error } = await sb.rpc("respond_link", { p_id: l.id, p_accept: accept });
    if (error) return toast(rpcError(error), { kind: "erro" });
    toast(accept ? `${l.outra_nome ?? "Cliente"} adicionado aos seus clientes` : "Pedido recusado");
    load();
  }

  if (!loading && me?.pt_estado !== "aprovado") {
    return (
      <div className="mx-auto max-w-xl pt-6">
        <EmptyState icon="user" title="Área de treinador">
          Esta área fica disponível quando o seu Perfil Treinador for aprovado. Pode pedir em{" "}
          <Link href="/perfil" className="font-medium text-accent">
            Perfil
          </Link>
          .
        </EmptyState>
      </div>
    );
  }

  const pending = links.filter((l) => l.status === "pendente");
  const active = links.filter((l) => l.status === "ativo");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientes"
        subtitle={
          me?.trainer_code ? (
            <>
              O seu código: <code className="rounded bg-accent-soft px-1.5 py-0.5 font-semibold tracking-wider text-accent">{me.trainer_code}</code>
            </>
          ) : undefined
        }
      />

      {loading && <Skeleton className="h-40" />}

      {pending.length > 0 && (
        <SectionCard title={`Pedidos de ligação (${pending.length})`}>
          <ul className="divide-y divide-line">
            {pending.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={l.outra_nome} email={l.outra_email} src={l.outra_avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.outra_nome ?? l.outra_email}</div>
                  <div className="text-xs text-muted">
                    {l.outra_email} · pede: {[l.perm_dieta && "plano alimentar", l.perm_progresso && "ver progresso", l.perm_treino && "plano de treino"].filter(Boolean).join(", ")}
                  </div>
                </div>
                <button className="btn btn-ghost !min-h-10" onClick={() => respond(l, false)}>
                  Recusar
                </button>
                <button className="btn btn-primary !min-h-10" onClick={() => respond(l, true)}>
                  <Icon name="check" size={18} /> Aceitar
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {!loading && active.length === 0 && pending.length === 0 && (
        <EmptyState icon="user" title="Ainda sem clientes">
          Partilhe o seu código {me?.trainer_code ? <strong>{me.trainer_code}</strong> : null}. O cliente cria a conta, vai a Perfil → O meu treinador e
          introduz o código. O pedido aparece aqui para aceitar.
        </EmptyState>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((l) => (
            <Link key={l.id} href={`/clientes/${l.outra_id}`} className="card flex flex-col gap-2 p-4 transition-colors hover:bg-card-2">
              <div className="flex items-center gap-3">
                <Avatar name={l.outra_nome} email={l.outra_email} src={l.outra_avatar} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{l.outra_nome ?? "Cliente"}</span>
                  <span className="block truncate text-xs text-muted">{l.outra_email}</span>
                </span>
                <Icon name="chevronRight" size={18} className="text-muted" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {l.perm_dieta && <StatusBadge tone="accent">Plano alimentar</StatusBadge>}
                {l.perm_progresso && <StatusBadge tone="accent">Progresso</StatusBadge>}
                {l.perm_treino && <StatusBadge tone="accent">Treino</StatusBadge>}
              </div>
              <span className="text-xs text-muted">Cliente desde {l.aceite_em ? new Date(l.aceite_em).toLocaleDateString("pt-PT") : "–"}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
