"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ageOn, bmrMifflin } from "@/lib/nutrition";
import { getProfile, getUserId, isoDay, type Profile } from "@/lib/data";

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
    setP(await getProfile(sb));
    const { data } = await sb.from("weights").select("dia,kg").order("dia", { ascending: false }).limit(14);
    setWeights((data ?? []).map((w) => ({ dia: w.dia, kg: Number(w.kg) })));
    const { count } = await sb.from("oura_daily").select("dia", { count: "exact", head: true });
    setOuraLinked((count ?? 0) > 0);
    const { data: u } = await sb.auth.getUser();
    setEmail(u.user?.email ?? "");
    const { data: log } = await sb.from("health_ingest_log").select("recebido_em,resumo,bytes").order("recebido_em", { ascending: false }).limit(1);
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
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Perfil e metas</h1>

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">Peso</h2>
        <p className="text-xs text-muted">Idealmente todos os dias, de manhã, em jejum. O app usa a tendência, não o valor isolado.</p>
        <div className="mt-3 flex gap-2">
          <input inputMode="decimal" className="tabular w-32" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} />
          <button className="rounded-xl bg-accent px-4 text-white" onClick={addWeight}>
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

      <button className="w-full rounded-xl bg-accent py-3 font-medium text-white" onClick={save}>
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

      <form action="/auth/signout" method="post" className="pt-2 text-center text-sm text-muted">
        {email} ·{" "}
        <button type="submit" className="text-accent">
          Sair
        </button>
      </form>
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
