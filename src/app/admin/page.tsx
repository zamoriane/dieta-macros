"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, PageHeader, SectionCard, Skeleton, StatusBadge, type Tone } from "@/components/ui/Primitives";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";

type U = {
  id: string;
  email: string | null;
  nome?: string | null;
  role?: "cliente" | "treinador" | "admin";
  ativo?: boolean;
  pt_estado?: "pendente" | "aprovado" | "recusado" | null;
  pt_contacto_email?: string | null;
  pt_pedido_em?: string | null;
  trainer_code?: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
};
type Acao = "ativar" | "desativar" | "aprovar_pt" | "recusar_pt" | "remover_pt";
type AuditRow = { id: number; acao: string; em: string; actor: string | null; target: string | null };

const ROLE: Record<string, { label: MessageKey; tone: Tone }> = {
  admin: { label: "admin.role.admin", tone: "accent" },
  treinador: { label: "admin.role.treinador", tone: "good" },
  cliente: { label: "admin.role.cliente", tone: "neutral" },
};
const ACAO_LABEL: Record<string, MessageKey> = {
  ativar: "admin.feito.ativar",
  desativar: "admin.feito.desativar",
  aprovar_pt: "admin.feito.aprovar_pt",
  recusar_pt: "admin.feito.recusar_pt",
  remover_pt: "admin.feito.remover_pt",
};
const TITLE: Record<Acao, MessageKey> = {
  ativar: "admin.titulo.ativar",
  desativar: "admin.titulo.desativar",
  aprovar_pt: "admin.titulo.aprovar_pt",
  recusar_pt: "admin.titulo.recusar_pt",
  remover_pt: "admin.titulo.remover_pt",
};
const EXPLICA: Record<Acao, MessageKey> = {
  ativar: "admin.explica.ativar",
  desativar: "admin.explica.desativar",
  aprovar_pt: "admin.explica.aprovar_pt",
  recusar_pt: "admin.explica.recusar_pt",
  remover_pt: "admin.explica.remover_pt",
};

export default function AdminPage() {
  const { t, df } = useI18n();
  const fmt = (s?: string | null) => (s ? df(new Date(s), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
  const sb = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<U[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ user: U; acao: Acao } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const j = await res.json();
    setUsers(j.users ?? []);
    setMe(j.me ?? null);
    const { data } = await sb.from("admin_audit").select("id, acao, em, actor, target").order("em", { ascending: false }).limit(15);
    setAudit((data ?? []) as AuditRow[]);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(user: U, acao: Acao) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? t("comum.erro"));
      toast(`${t(ACAO_LABEL[acao])}: ${user.nome || user.email}`);
      setConfirm(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { kind: "erro" });
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <EmptyState icon="alert" title={t("admin.reservado")} />
      </div>
    );
  }

  const name = (u: U) => u.nome || u.email || u.id.slice(0, 8);
  const pending = users.filter((u) => u.pt_estado === "pendente");
  const filtered = users.filter((u) => !q || `${u.nome ?? ""} ${u.email ?? ""} ${u.trainer_code ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const byId = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.admin")} subtitle={t("admin.subtitulo")} />

      <section className="tabular grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t("admin.utilizadores")} value={users.length} />
        <Kpi label={t("admin.ativos")} value={users.filter((u) => u.ativo !== false).length} />
        <Kpi label={t("admin.treinadores")} value={users.filter((u) => u.pt_estado === "aprovado").length} />
        <Kpi label={t("admin.pedidosPt")} value={pending.length} highlight={pending.length > 0} />
      </section>

      {pending.length > 0 && (
        <SectionCard title={t("admin.pedidosPtN", { n: pending.length })}>
          <ul className="divide-y divide-line">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{name(u)}</div>
                  <div className="text-xs text-muted">
                    {u.email} · {t("admin.contacto", { email: u.pt_contacto_email || "–" })} · {t("admin.pedido", { data: fmt(u.pt_pedido_em) })}
                  </div>
                </div>
                <button className="btn btn-ghost !min-h-10" onClick={() => setConfirm({ user: u, acao: "recusar_pt" })}>
                  {t("admin.recusar")}
                </button>
                <button className="btn btn-primary !min-h-10" onClick={() => setConfirm({ user: u, acao: "aprovar_pt" })}>
                  <Icon name="check" size={18} /> {t("admin.aprovar")}
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title={t("admin.utilizadores")}
        padded={false}
        action={
          <div className="relative w-56 max-w-full">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="w-full !min-h-9 !py-1.5 !pl-9 text-sm" placeholder={t("admin.pesquisar")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("admin.pesquisarAria")} />
          </div>
        }
      >
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((u) => {
              const role = ROLE[u.role ?? "cliente"];
              const isMe = u.id === me;
              return (
                <li key={u.id} className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5 ${u.ativo === false ? "opacity-70" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{name(u)}</span>
                      {isMe && <span className="text-xs text-muted">{t("admin.voce")}</span>}
                      <StatusBadge tone={role.tone}>{t(role.label)}</StatusBadge>
                      {u.ativo === false && <StatusBadge tone="bad">{t("admin.desativado")}</StatusBadge>}
                      {u.pt_estado === "pendente" && <StatusBadge tone="warn">{t("admin.ptPendente")}</StatusBadge>}
                      {u.pt_estado === "recusado" && <StatusBadge tone="neutral">{t("admin.ptRecusado")}</StatusBadge>}
                      {u.trainer_code && (
                        <code className="rounded-md bg-card-2 px-1.5 py-0.5 text-xs font-semibold tracking-wider">{u.trainer_code}</code>
                      )}
                      {!u.email_confirmed && <StatusBadge>{t("admin.emailPorConfirmar")}</StatusBadge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {u.email} · {t("admin.criado", { data: fmt(u.created_at) })} · {t("admin.ultimoAcesso", { data: fmt(u.last_sign_in_at) })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {u.pt_estado === "aprovado" && !isMe && (
                      <button className="btn btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => setConfirm({ user: u, acao: "remover_pt" })}>
                        {t("admin.removerPt")}
                      </button>
                    )}
                    {u.pt_estado !== "aprovado" && u.pt_estado !== "pendente" && (
                      <button className="btn btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => setConfirm({ user: u, acao: "aprovar_pt" })}>
                        {t("admin.tornarTreinador")}
                      </button>
                    )}
                    {!isMe &&
                      (u.ativo === false ? (
                        <button className="btn btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => setConfirm({ user: u, acao: "ativar" })}>
                          {t("admin.ativar")}
                        </button>
                      ) : (
                        <button className="btn btn-ghost !min-h-9 !px-3 !text-xs !text-bad" onClick={() => setConfirm({ user: u, acao: "desativar" })}>
                          {t("admin.desativar")}
                        </button>
                      ))}
                  </div>
                </li>
              );
            })}
            {!filtered.length && <li className="px-5 py-6 text-center text-sm text-muted">{t("admin.nenhum")}</li>}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={t("admin.ultimasAcoes")}>
        {audit.length ? (
          <ul className="space-y-2 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {ACAO_LABEL[a.acao] ? t(ACAO_LABEL[a.acao]) : a.acao} · <span className="font-medium">{a.target ? name(byId.get(a.target) ?? ({ id: a.target } as U)) : "–"}</span>
                </span>
                <span className="text-xs text-muted">
                  {fmt(a.em)} {t("admin.por")} {a.actor ? name(byId.get(a.actor) ?? ({ id: a.actor } as U)) : "–"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("admin.semAcoes")}</p>
        )}
      </SectionCard>

      <ResponsiveDialog
        open={!!confirm}
        title={confirm ? t(TITLE[confirm.acao]) : ""}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setConfirm(null)}>
              {t("comum.cancelar")}
            </button>
            <button
              className={`btn flex-1 ${confirm?.acao === "desativar" || confirm?.acao === "remover_pt" ? "bg-bad text-white" : "btn-primary"}`}
              disabled={busy}
              onClick={() => confirm && run(confirm.user, confirm.acao)}
            >
              {busy ? t("admin.aAplicar") : t("comum.confirmar")}
            </button>
          </>
        }
      >
        {confirm && (
          <p className="text-sm">
            {t(EXPLICA[confirm.acao])}{" "}
            <span className="font-medium">({name(confirm.user)})</span>
          </p>
        )}
      </ResponsiveDialog>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`card p-4 ${highlight ? "border-warn/40 bg-warn-soft" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
