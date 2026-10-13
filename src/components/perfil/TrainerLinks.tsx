"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { myLinks, rpcError, type Link } from "@/lib/links";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { StatusBadge } from "@/components/ui/Primitives";
import { toast } from "@/components/ui/Toast";

const PERMS = [
  { key: "perm_dieta", label: "Criar e editar o meu plano alimentar", disabled: false },
  { key: "perm_progresso", label: "Ver o meu progresso (registos do dia, peso e resumo)", disabled: false },
  { key: "perm_treino", label: "Criar e editar o meu plano de treino (e ver as séries que registo)", disabled: false },
] as const;

type Perms = { perm_dieta: boolean; perm_progresso: boolean; perm_treino: boolean };

/** Secção do Perfil onde o cliente se liga a um treinador e gere as permissões que lhe dá. */
export function TrainerLinks() {
  const sb = useMemo(() => createClient(), []);
  const [links, setLinks] = useState<Link[]>([]);
  const [code, setCode] = useState("");
  const [perms, setPerms] = useState<Perms>({ perm_dieta: true, perm_progresso: true, perm_treino: false });
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<Link | null>(null);

  const load = useCallback(async () => {
    try {
      setLinks((await myLinks(sb)).filter((l) => l.papel === "cliente"));
    } catch {
      setLinks([]);
    }
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  async function request() {
    setBusy(true);
    const { data, error } = await sb.rpc("request_trainer", {
      p_code: code,
      p_dieta: perms.perm_dieta,
      p_treino: perms.perm_treino,
      p_progresso: perms.perm_progresso,
    });
    setBusy(false);
    if (error) return toast(rpcError(error), { kind: "erro" });
    setCode("");
    toast(`Pedido enviado a ${(data as { trainer_nome: string }).trainer_nome}. Fica ativo quando o treinador aceitar.`);
    load();
  }

  async function togglePerm(l: Link, key: keyof Perms) {
    const next = { perm_dieta: l.perm_dieta, perm_progresso: l.perm_progresso, perm_treino: l.perm_treino, [key]: !l[key] };
    const { error } = await sb.rpc("set_link_perms", { p_id: l.id, p_dieta: next.perm_dieta, p_treino: next.perm_treino, p_progresso: next.perm_progresso });
    if (error) return toast(rpcError(error), { kind: "erro" });
    toast("Permissões atualizadas");
    load();
  }

  async function doRevoke() {
    if (!revoke) return;
    const { error } = await sb.rpc("revoke_link", { p_id: revoke.id });
    if (error) return toast(rpcError(error), { kind: "erro" });
    toast(`Ligação com ${revoke.outra_nome ?? "o treinador"} terminada`);
    setRevoke(null);
    load();
  }

  const validCode = /^PT-[A-Z0-9]{5}$/i.test(code.trim());

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-4">
      <div>
        <h2 className="font-medium">O meu treinador</h2>
        <p className="text-xs text-muted">Ligue-se a um treinador com o código que ele lhe deu. Pode alterar as permissões ou terminar a ligação a qualquer momento.</p>
      </div>

      {links.map((l) => (
        <div key={l.id} className="space-y-3 rounded-xl bg-card-2 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{l.outra_nome ?? "Treinador"}</span>
            <StatusBadge tone={l.status === "ativo" ? "good" : "warn"}>{l.status === "ativo" ? "Ativo" : "A aguardar aceitação"}</StatusBadge>
            {l.outra_email && <span className="text-xs text-muted">{l.outra_email}</span>}
          </div>
          <ul className="space-y-2">
            {PERMS.map((p) => (
              <li key={p.key}>
                <label className={`flex items-start gap-3 ${p.disabled ? "opacity-50" : ""}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 !min-h-0 accent-[var(--accent)]"
                    checked={l[p.key]}
                    disabled={p.disabled}
                    onChange={() => togglePerm(l, p.key)}
                  />
                  <span>{p.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <button className="btn btn-ghost !min-h-9 !px-3 !text-xs !text-bad" onClick={() => setRevoke(l)}>
            {l.status === "ativo" ? "Terminar ligação" : "Cancelar pedido"}
          </button>
        </div>
      ))}

      {links.length === 0 && (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium">Código do treinador</span>
            <input
              className="mt-1.5 w-full font-semibold uppercase tracking-widest"
              placeholder="PT-XXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoCapitalize="characters"
            />
          </label>
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 font-medium">O que o treinador pode fazer</legend>
            {PERMS.map((p) => (
              <label key={p.key} className={`flex items-start gap-3 ${p.disabled ? "opacity-50" : ""}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 !min-h-0 accent-[var(--accent)]"
                  checked={perms[p.key]}
                  disabled={p.disabled}
                  onChange={() => setPerms({ ...perms, [p.key]: !perms[p.key] })}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted">
            Ao ligar-se, autoriza o treinador a aceder aos dados de saúde indicados acima (incluindo, no progresso, peso e atividade). Pode revogar a qualquer
            momento.
          </p>
          <button className="btn btn-primary" disabled={!validCode || busy} onClick={request}>
            {busy ? "A enviar…" : "Ligar ao treinador"}
          </button>
        </div>
      )}

      <ResponsiveDialog
        open={!!revoke}
        title={revoke?.status === "ativo" ? "Terminar ligação" : "Cancelar pedido"}
        onClose={() => setRevoke(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setRevoke(null)}>
              Voltar
            </button>
            <button className="btn flex-1 bg-bad text-white" onClick={doRevoke}>
              Confirmar
            </button>
          </>
        }
      >
        <p className="text-sm">
          {revoke?.outra_nome ?? "O treinador"} deixa de ter acesso ao seu plano e aos seus dados. O que ele já alterou no plano mantém-se, e o histórico
          fica guardado.
        </p>
      </ResponsiveDialog>
    </section>
  );
}
