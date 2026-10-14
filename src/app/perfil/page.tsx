"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ageOn, bmrMifflin } from "@/lib/nutrition";
import { getProfile, getUserId, isoDay, type Profile } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { TrainerLinks } from "@/components/perfil/TrainerLinks";
import { AvatarEditor } from "@/components/perfil/AvatarEditor";
import { MeasurementsCard } from "@/components/medidas/MeasurementsCard";
import { DeleteAccount } from "@/components/perfil/DeleteAccount";
import { notifyProfileChanged } from "@/lib/avatar";
import { LanguageSwitch, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";

const OURA_MSG: Record<string, MessageKey> = {
  ok: "perfil.oura.ok",
  cancelado: "perfil.oura.cancelado",
  "estado-invalido": "perfil.oura.expirou",
  erro: "perfil.oura.erro",
};

export default function PerfilPage() {
  const { t, df } = useI18n();
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
    if (s) setOuraMsg(OURA_MSG[s] ? t(OURA_MSG[s]) : s);
  }, [load]);

  if (!p) return null;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP({ ...p, [k]: v });
    setSaved(false);
  };
  const num = (s: string) => (s === "" ? null : Number(s.replace(",", ".")));

  async function save() {
    // avatar e idioma têm as suas próprias gravações; não os sobrescrever com valores antigos
    const { id, avatar_url: _a, idioma: _i, ...rest } = p as Profile & { idioma?: string };
    const { error } = await sb.from("profiles").update(rest).eq("id", id);
    if (error) return alert(error.message);
    setSaved(true);
    notifyProfileChanged();
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
      <AvatarEditor
        uid={p.id}
        name={p.nome}
        email={email}
        src={p.avatar_url ?? null}
        onChange={(url) => {
          setP({ ...p, avatar_url: url });
          notifyProfileChanged();
        }}
      />

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">{t("perfil.peso")}</h2>
        <p className="text-xs text-muted">{t("perfil.pesoDica")}</p>
        <div className="mt-3 flex gap-2">
          <input inputMode="decimal" className="tabular w-32" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} />
          <button className="rounded-xl bg-accent px-4 text-on-accent" onClick={addWeight}>
            {t("perfil.registarHoje")}
          </button>
        </div>
        {weights.length > 0 && (
          <ul className="tabular mt-3 flex flex-wrap gap-2 text-xs text-muted">
            {weights.map((w) => (
              <li key={w.dia} className="rounded-full border border-line px-2 py-0.5">
                {df(w.dia, { day: "numeric", month: "short" })}: {w.kg.toFixed(1)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <MeasurementsCard uid={p.id} sex={p.sexo ?? null} heightCm={p.altura_cm ? Number(p.altura_cm) : null} />

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">{t("perfil.dadosBasal")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("comum.nome")}>
            <input className="w-full" value={p.nome ?? ""} onChange={(e) => set("nome", e.target.value)} />
          </Field>
          <Field label={t("perfil.sexo")}>
            <select className="w-full" value={p.sexo ?? ""} onChange={(e) => set("sexo", (e.target.value || null) as Profile["sexo"])}>
              <option value="">—</option>
              <option value="M">{t("perfil.masculino")}</option>
              <option value="F">{t("perfil.feminino")}</option>
            </select>
          </Field>
          <Field label={t("perfil.nascimento")}>
            <input type="date" className="w-full" value={p.data_nascimento ?? ""} onChange={(e) => set("data_nascimento", e.target.value || null)} />
          </Field>
          <Field label={t("perfil.altura")}>
            <input inputMode="decimal" className="w-full" value={p.altura_cm ?? ""} onChange={(e) => set("altura_cm", num(e.target.value))} />
          </Field>
        </div>
        {bmr && (
          <p className="tabular text-sm">
            {t("perfil.basalEstimado")} <strong>{t("perfil.kcalDia", { kcal: bmr })}</strong>
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">{t("perfil.metas")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("perfil.deficeAlvo")} hint={t("perfil.deficeAlvoDica")}>
            <input inputMode="numeric" className="w-full" value={p.deficit_alvo_kcal} onChange={(e) => set("deficit_alvo_kcal", Number(e.target.value) || 0)} />
          </Field>
          <Field label={t("perfil.pesoMeta")} hint={t("perfil.pesoMetaDica")}>
            <input inputMode="decimal" className="w-full" value={p.peso_meta_kg ?? ""} onChange={(e) => set("peso_meta_kg", num(e.target.value))} />
          </Field>
          <Field label={t("perfil.proteinaKg")} hint={t("perfil.proteinaKgDica")}>
            <input inputMode="decimal" className="w-full" value={p.proteina_g_kg} onChange={(e) => set("proteina_g_kg", num(e.target.value) ?? 1.8)} />
          </Field>
          <Field label={t("perfil.gorduraPct")}>
            <input inputMode="numeric" className="w-full" value={p.gordura_pct} onChange={(e) => set("gordura_pct", Number(e.target.value) || 25)} />
          </Field>
          <Field label={t("perfil.minimo")} hint={t("perfil.minimoDica")}>
            <input inputMode="numeric" className="w-full" value={p.kcal_minimo} onChange={(e) => set("kcal_minimo", Number(e.target.value) || 1500)} />
          </Field>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">{t("perfil.calcAtividade")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("perfil.correcao")} hint={t("perfil.correcaoDica")}>
            <input
              inputMode="decimal"
              className="w-full"
              value={p.fator_correcao_atividade}
              onChange={(e) => set("fator_correcao_atividade", num(e.target.value) ?? 0.85)}
            />
          </Field>
          <Field label={t("perfil.fatorSemOura")} hint={t("perfil.fatorSemOuraDica")}>
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
        {saved ? t("perfil.guardado") : t("perfil.guardar")}
      </button>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">Apple Watch (Health Auto Export)</h2>
        <Field label={t("perfil.fonteKcal")} hint={t("perfil.fonteKcalDica")}>
          <select className="w-full" value={p.fonte_atividade ?? "oura"} onChange={(e) => set("fonte_atividade", e.target.value as Profile["fonte_atividade"])}>
            <option value="oura">Oura</option>
            <option value="apple">Apple Watch</option>
          </select>
        </Field>
        {p.ingest_token ? (
          <div className="space-y-2 text-sm">
            <Copyable t={t} label="URL" value={`${location.origin}/api/ingest/apple-health`} copied={copied} setCopied={setCopied} />
            <Copyable t={t} label="Header Authorization" value={`Bearer ${p.ingest_token}`} copied={copied} setCopied={setCopied} />
            <button
              className="text-xs text-muted underline"
              onClick={async () => {
                if (!confirm(t("perfil.tokenNovoConfirm"))) return;
                const tok = newToken();
                await sb.from("profiles").update({ ingest_token: tok }).eq("id", p.id);
                set("ingest_token", tok);
              }}
            >
              {t("perfil.tokenNovo")}
            </button>
          </div>
        ) : (
          <button
            className="rounded-xl border border-line px-4 py-2 text-sm"
            onClick={async () => {
              const tok = newToken();
              const { error } = await sb.from("profiles").update({ ingest_token: tok }).eq("id", p.id);
              if (error) return alert(error.message);
              set("ingest_token", tok);
            }}
          >
            {t("perfil.gerarToken")}
          </button>
        )}
        <p className="text-xs text-muted">
          {lastIngest
            ? t("perfil.ultimoEnvio", {
                quando: df(new Date(lastIngest.recebido_em), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
                dias: lastIngest.resumo.dias?.join(", ") || "–",
                metricas: lastIngest.resumo.metricas?.join(", ") || t("perfil.nenhuma"),
              }) +
              (lastIngest.resumo.treinos ? ` · ${t("perfil.nTreinos", { n: lastIngest.resumo.treinos })}` : "") +
              (lastIngest.resumo.erro ? ` · ${t("perfil.erroEnvio", { erro: lastIngest.resumo.erro })}` : "") +
              ` · ${Math.round(((lastIngest as { bytes?: number }).bytes ?? 0) / 1024)} KB`
            : t("perfil.semEnvio")}
        </p>
      </section>

      <TrainerLinks />

      <TrainerSection p={p} email={email} onChange={load} sb={sb} />

      {p.pt_estado === "aprovado" && (
        <a href="/clientes" className="card flex items-center gap-3 p-4 text-sm font-medium hover:bg-card-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="users" size={18} />
          </span>
          {t("perfil.meusClientes")}
          <Icon name="chevronRight" size={16} className="ml-auto text-muted" />
        </a>
      )}

      {p.role === "admin" && (
        <a href="/admin" className="card flex items-center gap-3 p-4 text-sm font-medium hover:bg-card-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="gauge" size={18} />
          </span>
          {t("perfil.adminLink")}
          <Icon name="chevronRight" size={16} className="ml-auto text-muted" />
        </a>
      )}

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="font-medium">Oura</h2>
        {ouraMsg && <p className="mt-1 text-sm">{ouraMsg}</p>}
        <p className="mt-1 text-sm text-muted">
          {ouraLinked ? t("perfil.ouraLigado") : t("perfil.ouraLigue")}
        </p>
        <a href="/api/oura/connect" className="mt-3 inline-block rounded-xl border border-line px-4 py-2 text-sm">
          {ouraLinked ? t("perfil.ouraReligar") : t("perfil.ouraLigar")}
        </a>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <div>
          <h2 className="font-medium">{t("perfil.conta")}</h2>
          <p className="text-sm text-muted">{email}</p>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>{t("lang.label")}</span>
          <LanguageSwitch />
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/nova-senha" className="btn btn-ghost">
            {t("nav.alterarPassword")}
          </a>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost !text-bad">
              {t("perfil.sair")}
            </button>
          </form>
          <DeleteAccount email={email} />
        </div>
        <p className="flex gap-4 text-xs text-muted">
          <a href="/privacidade" className="hover:text-ink">
            {t("legal.privacidade")}
          </a>
          <a href="/termos" className="hover:text-ink">
            {t("legal.termos")}
          </a>
        </p>
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

function Copyable({
  t,
  label,
  value,
  copied,
  setCopied,
}: {
  t: ReturnType<typeof useI18n>["t"];
  label: string;
  value: string;
  copied: string | null;
  setCopied: (v: string | null) => void;
}) {
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
          {copied === label ? t("comum.copiado") : t("comum.copiar")}
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
  const { t, df } = useI18n();
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
    toast(pt_estado ? t("pt.pedidoEnviado") : t("pt.pedidoCancelado"));
    setWant(false);
    onChange();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <h2 className="font-medium">{t("pt.titulo")}</h2>

      {p.pt_estado === "aprovado" && p.trainer_code ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted">{t("pt.ativo")}</p>
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
              {copied ? t("comum.copiado") : t("comum.copiar")}
            </button>
          </div>
        </div>
      ) : p.pt_estado === "pendente" ? (
        <div className="space-y-2 text-sm">
          <p>
            {p.pt_pedido_em ? t("pt.pendenteEm", { data: df(new Date(p.pt_pedido_em), { day: "numeric", month: "short", year: "numeric" }) }) : t("pt.pendente")}
          </p>
          <p className="text-xs text-muted">{t("pt.contactoIndicado", { email: p.pt_contacto_email ?? "" })}</p>
          <button className="btn btn-ghost !min-h-10" disabled={busy} onClick={() => setEstado(null)}>
            {t("pt.cancelarPedido")}
          </button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          {p.pt_estado === "recusado" && <p className="rounded-xl bg-card-2 p-3 text-muted">{t("pt.recusado")}</p>}
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-5 w-5 !min-h-0 accent-[var(--accent)]" checked={want} onChange={(e) => setWant(e.target.checked)} />
            <span>
              <span className="font-medium">{t("pt.quero")}</span>
              <span className="block text-xs text-muted">{t("pt.queroDica")}</span>
            </span>
          </label>
          {want && (
            <div className="space-y-2 pl-8">
              <label className="block">
                <span className="text-xs font-medium">{t("pt.emailContacto")}</span>
                <input type="email" className="mt-1 w-full" value={contact} onChange={(e) => setContact(e.target.value)} />
                {!validEmail && contact && <span className="mt-1 block text-xs text-bad">{t("pt.emailInvalido")}</span>}
              </label>
              <button className="btn btn-primary" disabled={busy || !validEmail} onClick={() => setEstado("pendente")}>
                {t("pt.enviarPedido")}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
