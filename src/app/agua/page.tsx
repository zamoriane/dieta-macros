"use client";
import { AddVictusWidget } from "@/components/agua/AddVictusWidget";
import { VictusLiveActivity } from "@/components/agua/VictusLiveActivity";
import { VictusCard } from "@/components/agua/VictusCard";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, getProfile, isoDay, type Profile } from "@/lib/data";
import { addWater, autoWaterLiters, deleteWater, getWaterLogs, saveWaterConfig, type WaterLog } from "@/lib/waterData";
import {
  DRINK_IDS,
  INTERVALS,
  drinkFactor,
  drinkName,
  effectiveMl,
  goalMl as calcGoal,
  parseConfig,
  type Cup,
  type DrinkId,
  type WaterConfig,
} from "@/lib/water";
import { askReminderPermission, remindersSupported, syncFromLogs } from "@/lib/waterReminders";
import { WaterHistory } from "@/components/agua/WaterHistory";
import { DateNavigator, FormField, PageHeader, SectionCard, Skeleton } from "@/components/ui/Primitives";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";

export default function AguaPage() {
  const { t, nf, df, locale, weekday } = useI18n();
  const sb = useMemo(() => createClient(), []);
  const today = isoDay();
  const [dia, setDia] = useState(today);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cfg, setCfg] = useState<WaterConfig | null>(null);
  const [autoL, setAutoL] = useState<number | null>(null);
  const [logs, setLogs] = useState<WaterLog[] | null>(null);
  const [histKey, setHistKey] = useState(0);
  const [other, setOther] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = new URLSearchParams(location.search).get("dia");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today) setDia(d);
  }, [today]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const p = await getProfile(sb);
      setProfile(p);
      setCfg(parseConfig(p.agua));
      const [l, a] = await Promise.all([getWaterLogs(sb, p.id, dia, dia), autoWaterLiters(sb, p, dia, dia === today)]);
      setLogs(l);
      setAutoL(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sb, dia, today]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener("victus-synced", load);
    return () => window.removeEventListener("victus-synced", load);
  }, [load]);

  const goal = cfg ? calcGoal(cfg, autoL) : 0;
  const consumed = (logs ?? []).reduce((s, l) => s + effectiveMl(l.ml, l.fator), 0);
  const L = (ml: number) => nf(Math.round(ml / 100) / 10);

  const resync = useCallback(
    (next: WaterLog[], c: WaterConfig | null = cfg) => {
      if (!c || dia !== today) return Promise.resolve(0);
      return syncFromLogs(c.lembretes, next, calcGoal(c, autoL), t, (n) => nf(n));
    },
    [cfg, dia, today, autoL, t, nf],
  );

  async function add(ml: number, bebida: string) {
    try {
      const row = await addWater(sb, dia, ml, bebida);
      const next = [...(logs ?? []), row].sort((a, b) => a.hora.localeCompare(b.hora));
      setLogs(next);
      setHistKey((k) => k + 1);
      resync(next);
      toast(t("agua.registado", { ml, bebida: drinkName(bebida, locale).toLowerCase() }), {
        action: { label: t("comum.desfazer"), run: () => remove(row, next) },
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("comum.erroGuardar"), { kind: "erro" });
    }
  }

  async function remove(row: WaterLog, current: WaterLog[] | null = logs) {
    try {
      await deleteWater(sb, row.id);
      const next = (current ?? []).filter((l) => l.id !== row.id);
      setLogs(next);
      setHistKey((k) => k + 1);
      resync(next);
      toast(t("agua.apagado"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("comum.erro"), { kind: "erro" });
    }
  }

  if (error) return <p className="rounded-xl bg-bad/10 p-4 text-sm text-bad">{error}</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/" className="icon-btn" aria-label={t("comum.voltar")}>
          <Icon name="chevronLeft" />
        </Link>
        <PageHeader title={t("agua.pagina")} subtitle={t("agua.paginaSub")} />
      </div>

      <DateNavigator
        label={dia === today ? t("comum.hoje") : df(dia, { weekday: "short", day: "numeric", month: "short" })}
        onPrev={() => setDia(addDays(dia, -1))}
        onNext={() => setDia(addDays(dia, 1))}
        nextDisabled={dia >= today}
        onToday={() => setDia(today)}
        isToday={dia === today}
      />

      {cfg && logs !== null && dia === today && <VictusCard cfg={cfg} consumed={consumed} goal={goal} onAdd={add} onOther={() => setOther(true)} />}

      <AddVictusWidget />
      <VictusLiveActivity />

      {/* Past days retain their historical ring. Today uses Victus. */}
      {dia !== today && <section className="card p-5">
        {logs === null || !cfg ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <WaterRing value={consumed} goal={goal} label={t("agua.bebido", { v: L(consumed), meta: L(goal) })} />
            <div className="w-full min-w-0 flex-1 space-y-3">
              <p className="text-center text-sm font-medium sm:text-left">
                {consumed >= goal ? (
                  <span className="text-good">{t("agua.cumprida")}</span>
                ) : (
                  <span>{t("agua.falta", { l: L(goal - consumed) })}</span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {cfg.copos.map((c, i) => (
                  <button key={i} className="btn btn-ghost !min-h-12 flex-col !gap-0 !py-1.5" onClick={() => add(c.ml, c.bebida)}>
                    <span className="flex items-center gap-1 font-semibold">
                      <Icon name="plus" size={14} /> {c.ml} mL
                    </span>
                    <span className="text-[11px] font-normal text-muted">{drinkName(c.bebida, locale)}</span>
                  </button>
                ))}
                <button className="btn btn-ghost !min-h-12 text-sm" onClick={() => setOther(true)}>
                  {t("agua.outra")}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>}

      {/* Registos do dia */}
      <SectionCard title={dia === today ? t("agua.registos") : t("agua.registosDia", { dia: df(dia, { day: "numeric", month: "long" }) })}>
        {logs === null ? (
          <Skeleton className="h-16" />
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted">{t("agua.semRegistos")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {logs.map((l) => (
              <li key={l.id} className="flex min-h-12 items-center gap-3 py-1.5 text-sm">
                <span className="tabular w-12 shrink-0 text-muted">
                  {new Date(l.hora).toLocaleTimeString(locale === "en" ? "en-GB" : "pt-PT", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{drinkName(l.bebida, locale)}</span>
                  {l.fator !== 1 && <span className="block text-xs text-muted">{t("agua.conta", { ml: effectiveMl(l.ml, l.fator) })}</span>}
                </span>
                <span className="tabular font-semibold">{l.ml} mL</span>
                <button className="icon-btn" onClick={() => remove(l)} aria-label={t("comum.apagarX", { nome: drinkName(l.bebida, locale) })}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {profile && <WaterHistory owner={profile.id} goalMl={cfg && (cfg.meta_ml || autoL) ? goal : null} refreshKey={histKey} />}

      {profile && cfg && (
        <WaterSettings
          cfg={cfg}
          autoL={autoL}
          onSave={async (c) => {
            await saveWaterConfig(sb, profile.id, c);
            setCfg(c);
            let n = 0;
            if (c.lembretes.ativo && remindersSupported()) {
              const perm = await askReminderPermission();
              if (perm === "negado") return toast(t("agua.lembretesNegado"), { kind: "erro" });
              if (perm === "atualizar") return toast(t("agua.lembretesAtualizar"), { kind: "erro" });
            }
            if (dia === today) n = await resync(logs ?? [], c);
            else n = await syncFromLogs(c.lembretes, [], calcGoal(c, autoL), t, (x) => nf(x));
            toast(c.lembretes.ativo && n > 0 ? t("agua.lembretesAgendados", { n }) : t("agua.guardado"));
          }}
          weekday={weekday}
        />
      )}

      <OtherDrink open={other} onClose={() => setOther(false)} onAdd={(ml, b) => add(ml, b)} />
    </div>
  );
}

function WaterRing({ value, goal, label }: { value: number; goal: number; label: string }) {
  const { nf } = useI18n();
  const R = 54;
  const C = 2 * Math.PI * R;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36 shrink-0" role="img" aria-label={label}>
      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--card-2)" strokeWidth="11" />
      <circle
        cx="64"
        cy="64"
        r={R}
        fill="none"
        stroke={pct >= 1 ? "var(--good)" : "var(--prot)"}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${pct * C} ${C}`}
        transform="rotate(-90 64 64)"
        style={{ transition: "stroke-dasharray 400ms ease-out" }}
      />
      <text x="64" y="62" textAnchor="middle" className="fill-[var(--ink)] text-[24px] font-bold tabular-nums">
        {nf(Math.round(value / 100) / 10)}
      </text>
      <text x="64" y="82" textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
        / {nf(Math.round(goal / 100) / 10)} L
      </text>
    </svg>
  );
}

function OtherDrink({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (ml: number, bebida: string) => void }) {
  const { t, locale } = useI18n();
  const [bebida, setBebida] = useState<DrinkId>("agua");
  const [ml, setMl] = useState("250");
  const n = Number(ml.replace(",", "."));
  const bad = !(n >= 10 && n <= 3000);
  return (
    <ResponsiveDialog
      open={open}
      title={t("agua.outra")}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost flex-1" onClick={onClose}>
            {t("comum.cancelar")}
          </button>
          <button
            className="btn btn-primary flex-1"
            disabled={bad}
            onClick={() => {
              onAdd(Math.round(n), bebida);
              onClose();
            }}
          >
            {t("comum.adicionar")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label={t("agua.bebida")} hint={t("agua.fatores")}>
          <select className="w-full" value={bebida} onChange={(e) => setBebida(e.target.value as DrinkId)}>
            {DRINK_IDS.map((d) => (
              <option key={d} value={d}>
                {drinkName(d, locale)} · {Math.round(drinkFactor(d) * 100)}%
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("agua.quantidade")} error={bad && ml ? t("agua.erroQtd") : null}>
          <input data-autofocus className="w-full" inputMode="numeric" value={ml} onChange={(e) => setMl(e.target.value)} />
        </FormField>
        <div className="flex flex-wrap gap-2">
          {[150, 200, 250, 330, 500, 750].map((v) => (
            <button key={v} className="btn btn-ghost !min-h-9 !px-3 text-xs" onClick={() => setMl(String(v))}>
              {v} mL
            </button>
          ))}
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function WaterSettings({
  cfg,
  autoL,
  onSave,
  weekday,
}: {
  cfg: WaterConfig;
  autoL: number | null;
  onSave: (c: WaterConfig) => Promise<unknown>;
  weekday: (n: number) => string;
}) {
  const { t, nf, locale } = useI18n();
  const [d, setD] = useState<WaterConfig>(cfg);
  const [manual, setManual] = useState(cfg.meta_ml != null);
  const [metaTxt, setMetaTxt] = useState(String(cfg.meta_ml ?? Math.round((autoL ?? 2) * 1000)));
  const [busy, setBusy] = useState(false);
  const r = d.lembretes;
  const setR = (p: Partial<WaterConfig["lembretes"]>) => setD({ ...d, lembretes: { ...r, ...p } });
  const setCup = (i: number, p: Partial<Cup>) => setD({ ...d, copos: d.copos.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const meta = Number(metaTxt);
  const metaBad = manual && !(meta >= 500 && meta <= 8000);
  const cupsBad = d.copos.some((c) => !(c.ml >= 10 && c.ml <= 3000));
  const hoursBad = r.fim <= r.inicio;
  const fmtInterval = (m: number) => (m < 60 ? t("agua.cadaMin", { n: m }) : m % 60 ? t("agua.cadaHM", { h: Math.floor(m / 60), m: m % 60 }) : t("agua.cadaH", { n: m / 60 }));

  async function save() {
    if (metaBad || cupsBad || (r.ativo && hoursBad)) return;
    setBusy(true);
    try {
      await onSave({ ...d, meta_ml: manual ? Math.round(meta) : null });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("comum.erroGuardar"), { kind: "erro" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("agua.config")}>
      <div className="space-y-6">
        {/* Meta */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("agua.meta")}</h3>
          {autoL != null && <p className="text-xs text-muted">{t("agua.metaAuto", { l: nf(autoL) })}</p>}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            {t("agua.metaManualOn")}
          </label>
          {manual && (
            <FormField label={t("agua.metaMl")} error={metaBad ? t("agua.erroMeta") : null}>
              <input className="w-full sm:w-40" inputMode="numeric" value={metaTxt} onChange={(e) => setMetaTxt(e.target.value)} />
            </FormField>
          )}
        </div>

        {/* Botões rápidos */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("agua.copos")}</h3>
          <p className="text-xs text-muted">{t("agua.coposDica")}</p>
          <ul className="space-y-2">
            {d.copos.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  className="w-24"
                  inputMode="numeric"
                  aria-label={t("agua.quantidade")}
                  value={c.ml || ""}
                  onChange={(e) => setCup(i, { ml: Number(e.target.value.replace(/\D/g, "")) })}
                />
                <span className="text-sm text-muted">mL</span>
                <select className="min-w-0 flex-1" aria-label={t("agua.bebida")} value={c.bebida} onChange={(e) => setCup(i, { bebida: e.target.value as DrinkId })}>
                  {DRINK_IDS.map((x) => (
                    <option key={x} value={x}>
                      {drinkName(x, locale)}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-btn"
                  disabled={d.copos.length <= 1}
                  onClick={() => setD({ ...d, copos: d.copos.filter((_, j) => j !== i) })}
                  aria-label={t("comum.remover")}
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
          {cupsBad && <p className="text-xs text-bad">{t("agua.erroQtd")}</p>}
          {d.copos.length < 6 && (
            <button className="btn btn-ghost !min-h-9 text-sm" onClick={() => setD({ ...d, copos: [...d.copos, { ml: 330, bebida: "agua" }] })}>
              <Icon name="plus" size={16} /> {t("agua.novoBotao")}
            </button>
          )}
        </div>

        {/* Lembretes */}
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Icon name="bell" size={18} /> {t("agua.lembretes")}
          </h3>
          {!remindersSupported() && <p className="rounded-xl bg-card-2 p-3 text-xs text-muted">{t("agua.lembretesSoApp")}</p>}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={r.ativo} onChange={(e) => setR({ ativo: e.target.checked })} />
            {t("agua.lembretesAtivo")}
          </label>
          {r.ativo && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-1">
                  <FormField label={t("agua.intervalo")}>
                    <select className="w-full" value={r.intervalo} onChange={(e) => setR({ intervalo: Number(e.target.value) })}>
                      {INTERVALS.map((m) => (
                        <option key={m} value={m}>
                          {fmtInterval(m)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <FormField label={t("agua.inicio")}>
                  <input type="time" className="w-full" value={r.inicio} onChange={(e) => setR({ inicio: e.target.value })} />
                </FormField>
                <FormField label={t("agua.fim")}>
                  <input type="time" className="w-full" value={r.fim} onChange={(e) => setR({ fim: e.target.value })} />
                </FormField>
              </div>
              {hoursBad && <p className="text-xs text-bad">{t("agua.erroHoras")}</p>}
              <div>
                <span className="text-sm font-medium">{t("agua.diasSemana")}</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={t("agua.diasSemana")}>
                  {[1, 2, 3, 4, 5, 6, 0].map((n) => {
                    const on = r.dias.includes(n);
                    return (
                      <button
                        key={n}
                        aria-pressed={on}
                        onClick={() => setR({ dias: on ? r.dias.filter((x) => x !== n) : [...r.dias, n].sort() })}
                        className={`min-h-9 min-w-11 rounded-full border px-2.5 text-xs font-medium capitalize ${
                          on ? "border-accent bg-accent text-on-accent" : "border-line text-muted"
                        }`}
                      >
                        {weekday(n)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <FormField label={t("agua.texto")} hint={t("comum.opcional")}>
                <input className="w-full" maxLength={80} placeholder={t("agua.textoPh")} value={r.texto} onChange={(e) => setR({ texto: e.target.value })} />
              </FormField>
              <p className="text-xs text-muted">{t("agua.lembretesDica")}</p>
            </div>
          )}
        </div>

        <button className="btn btn-primary w-full sm:w-auto" disabled={busy || metaBad || cupsBad || (r.ativo && hoursBad)} onClick={save}>
          {busy ? t("comum.aGuardar") : t("comum.guardar")}
        </button>
      </div>
    </SectionCard>
  );
}
