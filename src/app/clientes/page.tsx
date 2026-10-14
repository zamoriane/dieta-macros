"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProfile, type Profile } from "@/lib/data";
import { myLinks, rpcError, type Link as TLink } from "@/lib/links";
import { EmptyState, PageHeader, SectionCard, Skeleton, StatusBadge } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { useI18n } from "@/lib/i18n/client";
import { toast } from "@/components/ui/Toast";

export default function ClientesPage() {
  const { t, df } = useI18n();
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
    if (error) return toast(rpcError(error, t), { kind: "erro" });
    toast(accept ? t("cli.adicionado", { nome: l.outra_nome ?? t("cli.cliente") }) : t("cli.recusado"));
    load();
  }

  if (!loading && me?.pt_estado !== "aprovado") {
    return (
      <div className="mx-auto max-w-xl pt-6">
        <EmptyState icon="user" title={t("cli.areaTreinador")}>
          {t("cli.areaTreinadorDica")}{" "}
          <Link href="/perfil" className="font-medium text-accent">
            {t("nav.perfil")}
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
        title={t("nav.clientes")}
        subtitle={
          me?.trainer_code ? (
            <>
              {t("cli.seuCodigo")} <code className="rounded bg-accent-soft px-1.5 py-0.5 font-semibold tracking-wider text-accent">{me.trainer_code}</code>
            </>
          ) : undefined
        }
      />

      {loading && <Skeleton className="h-40" />}

      {pending.length > 0 && (
        <SectionCard title={t("cli.pedidos", { n: pending.length })}>
          <ul className="divide-y divide-line">
            {pending.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={l.outra_nome} email={l.outra_email} src={l.outra_avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.outra_nome ?? l.outra_email}</div>
                  <div className="text-xs text-muted">
                    {l.outra_email} · {t("cli.pede")} {[l.perm_dieta && t("cli.p.dieta"), l.perm_progresso && t("cli.p.progresso"), l.perm_treino && t("cli.p.treino")].filter(Boolean).join(", ")}
                  </div>
                </div>
                <button className="btn btn-ghost !min-h-10" onClick={() => respond(l, false)}>
                  {t("admin.recusar")}
                </button>
                <button className="btn btn-primary !min-h-10" onClick={() => respond(l, true)}>
                  <Icon name="check" size={18} /> {t("cli.aceitar")}
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {!loading && active.length === 0 && pending.length === 0 && (
        <EmptyState icon="user" title={t("cli.semClientes")}>
          {t("cli.partilhe")} {me?.trainer_code ? <strong>{me.trainer_code}</strong> : null}. {t("cli.partilheDica")}
        </EmptyState>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((l) => (
            <Link key={l.id} href={`/clientes/${l.outra_id}`} className="card flex flex-col gap-2 p-4 transition-colors hover:bg-card-2">
              <div className="flex items-center gap-3">
                <Avatar name={l.outra_nome} email={l.outra_email} src={l.outra_avatar} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{l.outra_nome ?? t("cli.cliente")}</span>
                  <span className="block truncate text-xs text-muted">{l.outra_email}</span>
                </span>
                <Icon name="chevronRight" size={18} className="text-muted" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {l.perm_dieta && <StatusBadge tone="accent">{t("cli.planoAlimentar")}</StatusBadge>}
                {l.perm_progresso && <StatusBadge tone="accent">{t("cli.progresso")}</StatusBadge>}
                {l.perm_treino && <StatusBadge tone="accent">{t("nav.treino")}</StatusBadge>}
              </div>
              <span className="text-xs text-muted">{t("cli.desde", { data: l.aceite_em ? df(new Date(l.aceite_em), { day: "numeric", month: "short", year: "numeric" }) : "–" })}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
