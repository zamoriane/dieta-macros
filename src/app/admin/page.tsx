"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, PageHeader, SectionCard, Skeleton, StatusBadge, type Tone } from "@/components/ui/Primitives";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";

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

const ROLE: Record<string, { label: string; tone: Tone }> = {
  admin: { label: "Admin", tone: "accent" },
  treinador: { label: "Treinador", tone: "good" },
  cliente: { label: "Cliente", tone: "neutral" },
};
const ACAO_LABEL: Record<string, string> = {
  ativar: "Conta ativada",
  desativar: "Conta desativada",
  aprovar_pt: "Perfil Treinador aprovado",
  recusar_pt: "Pedido de PT recusado",
  remover_pt: "Perfil Treinador removido",
};

const TITLE: Record<Acao, string> = {
  ativar: "Ativar conta",
  desativar: "Desativar conta",
  aprovar_pt: "Aprovar Perfil Treinador",
  recusar_pt: "Recusar pedido de PT",
  remover_pt: "Remover Perfil Treinador",
};

const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

export default function AdminPage() {
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
      if (!res.ok) throw new Error(j.error ?? "Erro");
      toast(`${ACAO_LABEL[acao]}: ${user.nome || user.email}`);
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
        <EmptyState icon="alert" title="Acesso reservado ao administrador" />
      </div>
    );
  }

  const name = (u: U) => u.nome || u.email || u.id.slice(0, 8);
  const pending = users.filter((u) => u.pt_estado === "pendente");
  const filtered = users.filter((u) => !q || `${u.nome ?? ""} ${u.email ?? ""} ${u.trainer_code ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const byId = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="space-y-5">
      <PageHeader title="Administração" subtitle="Utilizadores, treinadores e acessos" />

      <section className="tabular grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Utilizadores" value={users.length} />
        <Kpi label="Ativos" value={users.filter((u) => u.ativo !== false).length} />
        <Kpi label="Treinadores" value={users.filter((u) => u.pt_estado === "aprovado").length} />
        <Kpi label="Pedidos de PT" value={pending.length} highlight={pending.length > 0} />
      </section>

      {pending.length > 0 && (
        <SectionCard title={`Pedidos de Perfil Treinador (${pending.length})`}>
          <ul className="divide-y divide-line">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{name(u)}</div>
                  <div className="text-xs text-muted">
                    {u.email} · contacto: {u.pt_contacto_email || "–"} · pedido {fmt(u.pt_pedido_em)}
                  </div>
                </div>
                <button className="btn btn-ghost !min-h-10" onClick={() => setConfirm({ user: u, acao: "recusar_pt" })}>
                  Recusar
                </button>
                <button className="btn btn-primary !min-h-10" onClick={() => setConfirm({ user: u, acao: "aprovar_pt" })}>
                  <Icon name="check" size={18} /> Aprovar
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title="Utilizadores"
        padded={false}
        action={
          <div className="relative w-56 max-w-full">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="w-full !min-h-9 !py-1.5 !pl-9 text-sm" placeholder="Pesquisar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar utilizadores" />
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
                      {isMe && <span className="text-xs text-muted">(você)</span>}
                      <StatusBadge tone={role.tone}>{role.label}</StatusBadge>
                      {u.ativo === false && <StatusBadge tone="bad">Desativado</StatusBadge>}
                      {u.pt_estado === "pendente" && <StatusBadge tone="warn">PT pendente</StatusBadge>}
                      {u.pt_estado === "recusado" && <StatusBadge tone="neutral">PT recusado</StatusBadge>}
                      {u.trainer_code && (
                        <code className="rounded-md bg-card-2 px-1.5 py-0.5 text-xs font-semibold tracking-wider">{u.trainer_code}</code>
                      )}
                      {!u.email_confirmed && <StatusBadge>email por confirmar</StatusBadge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {u.email} · criado {fmt(u.created_at)} · último acesso {fmt(u.last_sign_in_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {u.pt_estado === "aprovado" && !isMe && (
                      <button className="btn btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => setConfirm({ user: u, acao: "remover_pt" })}>
                        Remover PT
                      </button>
                    )}
                    {u.pt_estado !== "aprovado" && u.pt_estado !== "pendente" && (
                      <button className="btn btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => setConfirm({ user: u, acao: "aprovar_pt" })}>
                        Tornar treinador
                      </button>
                    )}
                    {!isMe &&
                      (u.ativo === false ? (
                        <button className="btn btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => setConfirm({ user: u, acao: "ativar" })}>
                          Ativar
                        </button>
                      ) : (
                        <button className="btn btn-ghost !min-h-9 !px-3 !text-xs !text-bad" onClick={() => setConfirm({ user: u, acao: "desativar" })}>
                          Desativar
                        </button>
                      ))}
                  </div>
                </li>
              );
            })}
            {!filtered.length && <li className="px-5 py-6 text-center text-sm text-muted">Nenhum utilizador encontrado.</li>}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Últimas ações">
        {audit.length ? (
          <ul className="space-y-2 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {ACAO_LABEL[a.acao] ?? a.acao} · <span className="font-medium">{a.target ? name(byId.get(a.target) ?? ({ id: a.target } as U)) : "–"}</span>
                </span>
                <span className="text-xs text-muted">
                  {fmt(a.em)} por {a.actor ? name(byId.get(a.actor) ?? ({ id: a.actor } as U)) : "–"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Ainda sem ações registadas.</p>
        )}
      </SectionCard>

      <ResponsiveDialog
        open={!!confirm}
        title={confirm ? TITLE[confirm.acao] : ""}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setConfirm(null)}>
              Cancelar
            </button>
            <button
              className={`btn flex-1 ${confirm?.acao === "desativar" || confirm?.acao === "remover_pt" ? "bg-bad text-white" : "btn-primary"}`}
              disabled={busy}
              onClick={() => confirm && run(confirm.user, confirm.acao)}
            >
              {busy ? "A aplicar…" : "Confirmar"}
            </button>
          </>
        }
      >
        {confirm && (
          <p className="text-sm">
            {
              {
                ativar: "A conta volta a poder entrar e usar o app.",
                desativar: "A pessoa deixa de conseguir entrar e o acesso aos dados fica bloqueado. Os dados não são apagados e a conta pode ser reativada.",
                aprovar_pt: "A pessoa passa a ter Perfil Treinador e recebe um código único para partilhar com os clientes.",
                recusar_pt: "O pedido fica recusado. A pessoa pode voltar a pedir mais tarde.",
                remover_pt: "A pessoa deixa de ser treinador e o código deixa de funcionar.",
              }[confirm.acao]
            }{" "}
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
