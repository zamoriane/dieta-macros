"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ageOn, bmrMifflin } from "@/lib/nutrition";
import { getProfile, getUserId, isoDay, type Profile } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { TrainerLinks } from "@/components/perfil/TrainerLinks";

const OURA_MSG: Record<string, string> = {
  ok: "Oura ligado e últimos 30 dias sincronizados.",
  cancelado: "Ligação ao Oura cancelada.",
  "estado-invalido": "A ligação expirou. Tente de novo.",
  erro: "Erro ao ligar ao Oura. Verifique as variáveis OURA_* na Vercel.",
};

export default function PerfilPage() {
  const sb = useMemo(() => createClient(), []);
  const [p, setP] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  const [weights, setWeights] = useState<{ dia: string; kg: number }[]>([]);
  const [kg, setKg] = useState("");
  const [ouraLinked, setOuraLinked] = useState(false);
  const [ouraMsg, setOuraMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [lastIngest, setLastIngest] = useState<{ recebido_em: string; resumo: { dias?: string[]; metricas?: string[]; treinos?: number; erro?: string } } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const prof = await getProfile(sb);
    setP(prof);
    const { data } = await sb.from("weights").select("dia,kg").eq("user_id", prof.id).order("dia", { ascending: false }).limit(14);
    setWeights((data ?? []).map((w) => ({ dia: w.dia, kg: Number(w.kg) })));
    const { count } = await sb.from("oura_daily").select("dia", { count: "exact", head: true }).eq("user_id", prof.id);
    setOuraLinked((count ?? 0) > 0);
    const { data: u } = await sb.auth.getUser();
    setEmail(u.user?.email ?? "");
    const { data: log } = await sb.from("health_ingest_log").select("recebido_em,resumo,bytes").eq("user_id", prof.id).order("recebido_em", { ascending: false }).limit(1);
    setLastIngest(log?.[0] ?? null);
  }, [sb]);

  useEffect(() => {
    load();
    const s = new URLSearchParams(location.search).get("oura");
    if (s) setOuraMsg(OURA_MSG[s] ?? s);
  }, [load]);

  if (!p) return null;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP({ ...p, [k]: v });
    setSaved(false);
  };
  const num = (s: string) => (s === "" ? null : Number(s.replace(",", ".")));

  async function save() {
    const { id, ...rest } = p!;
    const { error } = await sb.from("profiles").update(rest).eq("id", id);
    if (error) return alert(error.message);
    setSaved(true);
  }

  async function addWeight() {
    const v = num(kg);
    if (!v) return;
    const userId = await getUserId(sb);
    const { error } = await sb.from("weights").upsert({ user_id: userId, dia: isoDay(), kg: v });
    if (error) return alert(error.message);
    setKg("");
    load();
  }

  const lastKg = weights[0]?.kg;
  const bmr =
    p.sexo && p.data_nascimento && p.altura_cm && lastKg ? bmrMifflin(p.sexo, lastKg, Number(p.altura_cm), ageOn(p.data_nascimento)) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-xl font-semibold">Perfil e metas</h1>

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">Peso</h2>
        <p className="text-xs text-muted">Idealmente todos os dias, de manhã, em jejum. O app usa a tendência, não o valor isolado.</p>
        <div className="mt-3 flex gap-2">
          <input inputMode="decimal" className="tabular w-32" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} />
          <button className="rounded-xl bg-accent px-4 text-on-accent" onClick={addWeight}>
            Registar hoje
          </button>
        </div>
        {weights.length > 0 && (
          <ul className="tabular mt-3 flex flex-wrap gap-2 text-xs text-muted">
            {weights.map((w) => (
              <li key={w.dia} className="rounded-full border border-line px-2 py-0.5">
                {new Date(w.dia + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}: {w.kg.toFixed(1)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">Dados para o cálculo do basal</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <input className="w-full" value={p.nome ?? ""} onChange={(e) => set("nome", e.target.value)} />
          </Field>
          <Field label="Sexo">
            <select className="w-full" value={p.sexo ?? ""} onChange={(e) => set("sexo", (e.target.value || null) as Profile["sexo"])}>
              <option value="">—</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </Field>
          <Field label="Data de nascimento">
            <input type="date" className="w-full" value={p.data_nascimento ?? ""} onChange={(e) => set("data_nascimento", e.target.value || null)} />
          </Field>
          <Field label="Altura (cm)">
            <input inputMode="decimal" className="w-full" value={p.altura_cm ?? ""} onChange={(e) => set("altura_cm", num(e.target.value))} />
          </Field>
        </div>
        {bmr && (
          <p className="tabular text-sm">
            Basal estimado (Mifflin-St Jeor): <strong>{bmr} kcal/dia</strong>
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">Metas</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Défice diário alvo (kcal)" hint="500 ≈ 0,5 kg/semana">
            <input inputMode="numeric" className="w-full" value={p.deficit_alvo_kcal} onChange={(e) => set("deficit_alvo_kcal", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Peso meta (kg)" hint="o peso final desejado, não quanto perder">
            <input inputMode="decimal" className="w-full" value={p.peso_meta_kg ?? ""} onChange={(e) => set("peso_meta_kg", num(e.target.value))} />
          </Field>
          <Field label="Proteína (g por kg)" hint="1,6–2,2 em défice; usa o peso meta se definido">
            <input inputMode="decimal" className="w-full" value={p.proteina_g_kg} onChange={(e) => set("proteina_g_kg", num(e.target.value) ?? 1.8)} />
          </Field>
          <Field label="Gordura (% das kcal)">
            <input inputMode="numeric" className="w-full" value={p.gordura_pct} onChange={(e) => set("gordura_pct", Number(e.target.value) || 25)} />
          </Field>
          <Field label="Mínimo diário (kcal)" hint="alerta se ficar abaixo 3 dias">
            <input inputMode="numeric" className="w-full" value={p.kcal_minimo} onChange={(e) => set("kcal_minimo", Number(e.target.value) || 1500)} />
          </Field>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">Cálculo da atividade</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Correção sobre o Oura" hint="0,85 = conta 85% das calorias ativas">
            <input
              inputMode="decimal"
              className="w-full"
              value={p.fator_correcao_atividade}
              onChange={(e) => set("fator_correcao_atividade", num(e.target.value) ?? 0.85)}
            />
          </Field>
          <Field label="Fator sem Oura" hint="1,2 sedentário · 1,4 ativo">
            <input
              inputMode="decimal"
              className="w-full"
              value={p.fator_atividade_manual}
              onChange={(e) => set("fator_atividade_manual", num(e.target.value) ?? 1.3)}
            />
          </Field>
        </div>
      </section>

      <button className="w-full rounded-xl bg-accent py-3 font-medium text-on-accent" onClick={save}>
        {saved ? "Guardado ✓" : "Guardar perfil"}
      </button>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">Apple Watch (Health Auto Export)</h2>
        <Field label="Fonte das calorias ativas" hint="sono, prontidão e stress continuam a vir do Oura">
          <select className="w-full" value={p.fonte_atividade ?? "oura"} onChange={(e) => set("fonte_atividade", e.target.value as Profile["fonte_atividade"])}>
            <option value="oura">Oura</option>
            <option value="apple">Apple Watch</option>
          </select>
        </Field>
        {p.ingest_token ? (
          <div className="space-y-2 text-sm">
            <Copyable label="URL" value={`${location.origin}/api/ingest/apple-health`} copied={copied} setCopied={setCopied} />
            <Copyable label="Header Authorization" value={`Bearer ${p.ingest_token}`} copied={copied} setCopied={setCopied} />
            <button
              className="text-xs text-muted underline"
              onClick={async () => {
                if (!confirm("Gerar um token novo? O antigo deixa de funcionar e terá de atualizar a app no iPhone.")) return;
                const t = newToken();
                await sb.from("profiles").update({ ingest_token: t }).eq("id", p.id);
                set("ingest_token", t);
              }}
            >
              Gerar token novo
            </button>
          </div>
        ) : (
          <button
            className="rounded-xl border border-line px-4 py-2 text-sm"
            onClick={async () => {
              const t = newToken();
              const { error } = await sb.from("profiles").update({ ingest_token: t }).eq("id", p.id);
              if (error) return alert(error.message);
              set("ingest_token", t);
            }}
          >
            Gerar token de envio
          </button>
        )}
        <p className="text-xs text-muted">
          {lastIngest
            ? `Último envio: ${new Date(lastIngest.recebido_em).toLocaleString("pt-PT")} · dias ${lastIngest.resumo.dias?.join(", ") || "–"} · métricas: ${
                lastIngest.resumo.metricas?.join(", ") || "nenhuma"
              }${lastIngest.resumo.treinos ? ` · ${lastIngest.resumo.treinos} treinos` : ""}${
                lastIngest.resumo.erro ? ` · ERRO: ${lastIngest.resumo.erro}` : ""
              } · ${Math.round(((lastIngest as { bytes?: number }).bytes ?? 0) / 1024)} KB`
            : "Ainda não chegou nenhum envio do iPhone."}
        </p>
      </section>

      <TrainerLinks />

      <TrainerSection p={p} email={email} onChange={load} sb={sb} />

      {p.pt_estado === "aprovado" && (
        <a href="/clientes" className="card flex items-center gap-3 p-4 text-sm font-medium hover:bg-card-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="users" size={18} />
          </span>
          Os meus clientes
          <Icon name="chevronRight" size={16} className="ml-auto text-muted" />
        </a>
      )}

      {p.role === "admin" && (
        <a href="/admin" className="card flex items-center gap-3 p-4 text-sm font-medium hover:bg-card-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="gauge" size={18} />
          </span>
          Administração — utilizadores e treinadores
          <Icon name="chevronRight" size={16} className="ml-auto text-muted" />
        </a>
      )}

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">Oura</h2>
        {ouraMsg && <p className="mt-1 text-sm">{ouraMsg}</p>}
        <p className="mt-1 text-sm text-muted">
          {ouraLinked ? "Ligado. Os dados sincronizam ao abrir o app e todas as manhãs." : "Ligue a sua conta para trazer calorias ativas, sono, prontidão e stress."}
        </p>
        <a href="/api/oura/connect" className="mt-3 inline-block rounded-xl border border-line px-4 py-2 text-sm">
          {ouraLinked ? "Voltar a ligar" : "Ligar ao Oura"}
        </a>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <div>
          <h2 className="font-medium">Conta e segurança</h2>
          <p className="text-sm text-muted">{email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/nova-senha" className="btn btn-ghost">
            Alterar palavra-passe
          </a>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost !text-bad">
              Sair (terminar sessão)
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "dm_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function Copyable({ label, value, copied, setCopied }: { label: string; value: string; copied: string | null; setCopied: (v: string | null) => void }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-bg px-2 py-1.5 text-xs">{value}</code>
        <button
          className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(label);
              setTimeout(() => setCopied(null), 1500);
            } catch {}
          }}
        >
          {copied === label ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function TrainerSection({
  p,
  email,
  onChange,
  sb,
}: {
  p: Profile;
  email: string;
  onChange: () => void;
  sb: ReturnType<typeof createClient>;
}) {
  const [want, setWant] = useState(false);
  const [contact, setContact] = useState(p.pt_contacto_email || email);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);

  async function setEstado(pt_estado: "pendente" | null) {
    setBusy(true);
    const { error } = await sb
      .from("profiles")
      .update(pt_estado ? { pt_estado, pt_contacto_email: contact.trim() } : { pt_estado: null })
      .eq("id", p.id);
    setBusy(false);
    if (error) return toast(error.message, { kind: "erro" });
    toast(pt_estado ? "Pedido enviado ao administrador" : "Pedido cancelado");
    setWant(false);
    onChange();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <h2 className="font-medium">Perfil Treinador (PT)</h2>

      {p.pt_estado === "aprovado" && p.trainer_code ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted">O seu Perfil Treinador está ativo. Partilhe este código com os seus clientes para eles se ligarem a si.</p>
          <div className="flex items-center gap-2">
            <code className="rounded-xl bg-accent-soft px-4 py-2 text-xl font-bold tracking-widest text-accent">{p.trainer_code}</code>
            <button
              className="btn btn-ghost !min-h-10"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(p.trainer_code!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {}
              }}
            >
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
        </div>
      ) : p.pt_estado === "pendente" ? (
        <div className="space-y-2 text-sm">
          <p>
            Pedido enviado{p.pt_pedido_em ? ` em ${new Date(p.pt_pedido_em).toLocaleDateString("pt-PT")}` : ""}. Aguarda aprovação do administrador.
          </p>
          <p className="text-xs text-muted">Contacto indicado: {p.pt_contacto_email}</p>
          <button className="btn btn-ghost !min-h-10" disabled={busy} onClick={() => setEstado(null)}>
            Cancelar pedido
          </button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          {p.pt_estado === "recusado" && <p className="rounded-xl bg-card-2 p-3 text-muted">O pedido anterior não foi aprovado. Pode voltar a pedir.</p>}
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-5 w-5 !min-h-0 accent-[var(--accent)]" checked={want} onChange={(e) => setWant(e.target.checked)} />
            <span>
              <span className="font-medium">Quero ativar o Perfil Treinador (PT)</span>
              <span className="block text-xs text-muted">
                Sujeito a aprovação do administrador. Com o perfil ativo, recebe um código único e os seus clientes podem dar-lhe acesso para criar o
                plano alimentar e de treino deles.
              </span>
            </span>
          </label>
          {want && (
            <div className="space-y-2 pl-8">
              <label className="block">
                <span className="text-xs font-medium">Email de contacto</span>
                <input type="email" className="mt-1 w-full" value={contact} onChange={(e) => setContact(e.target.value)} />
                {!validEmail && contact && <span className="mt-1 block text-xs text-bad">Indique um email válido.</span>}
              </label>
              <button className="btn btn-primary" disabled={busy || !validEmail} onClick={() => setEstado("pendente")}>
                Enviar pedido
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
