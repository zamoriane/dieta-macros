"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { adaptiveTdee, KCAL_PER_KG } from "@/lib/nutrition";
import { addDays, avgOuraActive, computeDay, getActivityDays, getProfile, isoDay, type OuraDay, type Profile } from "@/lib/data";
import { PageHeader, SectionCard, Skeleton, StatusBadge } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { CalorieChart } from "@/components/resumo/CalorieChart";
import { WeightChart } from "@/components/resumo/WeightChart";
import { BodyProgress } from "@/components/medidas/BodyProgress";
import { useI18n } from "@/lib/i18n/client";

type Period = "semana" | "mes";
type Row = {
  dia: string;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  gasto: number | null;
  deficit: number | null;
  peso: number | null;
  sono: number | null;
};

function range(period: Period, offset: number): [string, string] {
  const today = new Date();
  if (period === "semana") {
    const d = new Date(today);
    const dow = (d.getDay() + 6) % 7; // segunda = 0
    d.setDate(d.getDate() - dow + offset * 7);
    const start = isoDay(d);
    return [start, addDays(start, 6)];
  }
  const s = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const e = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
  return [isoDay(s), isoDay(e)];
}

export default function ResumoPage() {
  const { t, df, locale } = useI18n();
  const il = locale === "en" ? "en-GB" : "pt-PT";
  const fmtN = (n: number, d = 0) => n.toLocaleString(il, { minimumFractionDigits: d, maximumFractionDigits: d });
  const dayLabel = (d: string) => df(d, { weekday: "short", day: "numeric", month: "short" });
  const sb = useMemo(() => createClient(), []);
  const [period, setPeriod] = useState<Period>("semana");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [weights, setWeights] = useState<{ dia: string; kg: number }[]>([]);
  const [tdee, setTdee] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, to] = range(period, offset);
  const today = isoDay();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const p = await getProfile(sb);
      setProfile(p);
      const src = p.fonte_atividade ?? "oura";
      const histFrom = addDays(from < addDays(today, -120) ? from : addDays(today, -120), -30);
      const [{ data: totals }, oura, { data: wdata }, avgActive] = await Promise.all([
        sb.from("daily_totals").select("*").eq("user_id", p.id).gte("dia", histFrom).lte("dia", to < today ? to : today),
        getActivityDays(sb, from, to, src),
        sb.from("weights").select("dia,kg").eq("user_id", p.id).gte("dia", histFrom).lte("dia", today).order("dia"),
        avgOuraActive(sb, today, 14, src),
      ]);
      const tByDay = new Map((totals ?? []).map((t) => [t.dia as string, t]));
      const oByDay = new Map((oura as OuraDay[]).map((o) => [o.dia, o]));
      const ws = (wdata ?? []).map((w) => ({ dia: w.dia as string, kg: Number(w.kg) }));
      setWeights(ws);
      const weightAt = (dia: string) => [...ws].reverse().find((w) => w.dia <= dia)?.kg ?? null;

      const out: Row[] = [];
      for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
        const t = tByDay.get(d);
        const o = oByDay.get(d) ?? null;
        const totalsM = t
          ? { kcal: Number(t.kcal), protein: Number(t.protein), carbs: Number(t.carbs), fat: Number(t.fat), fiber: Number(t.fiber) }
          : null;
        const calc = totalsM ? computeDay(p, weightAt(d), totalsM, o, d, { isToday: d === today, avgActive }) : null;
        out.push({
          dia: d,
          kcal: totalsM?.kcal ?? null,
          protein: totalsM?.protein ?? null,
          carbs: totalsM?.carbs ?? null,
          fat: totalsM?.fat ?? null,
          gasto: calc?.balance.expenditure ?? null,
          deficit: calc?.balance.deficit ?? null,
          peso: ws.find((w) => w.dia === d)?.kg ?? null,
          sono: o?.sleep_score ?? null,
        });
      }
      setRows(out);

      // TDEE adaptativo com os últimos 28 dias
      const hist: { intake: number | null; weight: number | null }[] = [];
      for (let d = addDays(today, -28); d < today; d = addDays(d, 1)) {
        const t = tByDay.get(d);
        hist.push({ intake: t ? Number(t.kcal) : null, weight: ws.find((w) => w.dia === d)?.kg ?? null });
      }
      setTdee(adaptiveTdee(hist));
      setLoading(false);
    })();
  }, [sb, from, to, today]);

  // Só dias com registo entram nas médias; dias sem registo nunca contam como zero.
  const logged = rows.filter((r) => r.kcal != null);
  const avg = (k: keyof Row) => {
    const v = logged.map((r) => r[k] as number | null).filter((x): x is number => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const withDeficit = logged.filter((r) => r.deficit != null);
  const deficitSum = withDeficit.reduce((s, r) => s + (r.deficit ?? 0), 0);
  const fatKg = withDeficit.length ? deficitSum / KCAL_PER_KG : null;
  const elapsed = rows.length; // dias do período até hoje
  const goal = profile?.peso_meta_kg && Number(profile.peso_meta_kg) >= 40 ? Number(profile.peso_meta_kg) : null;

  const label =
    period === "semana"
      ? `${df(from, { day: "numeric", month: "short" })} – ${df(to, { day: "numeric", month: "short" })}`
      : df(from, { month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      <PageHeader title={t("resumo.titulo")} subtitle={t("resumo.subtitulo")} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-line bg-card p-1 text-sm" role="group" aria-label={t("resumo.periodo")}>
          {(["semana", "mes"] as Period[]).map((p) => (
            <button
              key={p}
              aria-pressed={period === p}
              onClick={() => {
                setPeriod(p);
                setOffset(0);
              }}
              className={`min-h-9 rounded-lg px-4 font-medium ${period === p ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`}
            >
              {p === "semana" ? t("resumo.semana") : t("resumo.mes")}
            </button>
          ))}
        </div>
        <div className="card flex items-center gap-1 px-1 py-1">
          <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label={t("resumo.anterior")}>
            <Icon name="chevronLeft" />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold first-letter:uppercase">{label}</span>
          <button className="icon-btn disabled:opacity-30" disabled={offset >= 0} onClick={() => setOffset(offset + 1)} aria-label={t("resumo.seguinte")}>
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>

      {loading && !rows.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <section className="tabular grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label={t("resumo.indicadores")}>
          <Kpi label={t("resumo.mediaIngerida")} value={avg("kcal") != null ? fmtN(avg("kcal")!) : "–"} unit={t("resumo.kcalDia")} estLabel={t("resumo.estim")} />
          <Kpi label={t("resumo.proteinaMedia")} value={avg("protein") != null ? fmtN(avg("protein")!) : "–"} unit={t("resumo.gDia")} estLabel={t("resumo.estim")} />
          <Kpi
            label={t("resumo.deficeAcumulado")}
            estLabel={t("resumo.estim")}
            value={withDeficit.length ? `${deficitSum < 0 ? "−" : ""}${fmtN(Math.abs(deficitSum))}` : "–"}
            unit="kcal"
            estimate
            tone={withDeficit.length ? (deficitSum >= 0 ? "good" : "warn") : undefined}
          />
          <Kpi label={t("resumo.gorduraAprox")} value={fatKg != null ? fmtN(fatKg, 2) : "–"} unit="kg" estimate hint={`${fmtN(KCAL_PER_KG)} kcal ≈ 1 kg`} estLabel={t("resumo.estim")} />
          <Kpi
            label={t("resumo.consistencia")}
            value={`${logged.length}/${elapsed}`}
            unit={t("resumo.diasRegistados")}
            estLabel={t("resumo.estim")}
            className="col-span-2 lg:col-span-1"
          />
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title={t("resumo.grafCalorias")}>
          {rows.length ? <CalorieChart days={rows} weekly={period === "semana"} /> : <Skeleton className="h-56" />}
        </SectionCard>
        <WeightChart weights={weights} goal={goal} />
        {profile && <BodyProgress owner={profile.id} sex={profile.sexo ?? null} heightCm={profile.altura_cm ? Number(profile.altura_cm) : null} />}
      </div>

      {tdee != null && (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <Icon name="gauge" size={18} className="mt-0.5 shrink-0 text-accent" />
          <p>
            {t("resumo.tdee")} <strong className="tabular">{t("perfil.kcalDia", { kcal: fmtN(tdee) })}</strong>{" "}
            <StatusBadge>{t("resumo.estimativa")}</StatusBadge>
            {t("resumo.tdeeDica")}
          </p>
        </div>
      )}

      <SectionCard title={t("resumo.historico")} padded={false}>
        {/* Desktop: tabela */}
        <div className="hidden overflow-x-auto md:block">
          <table className="tabular w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2 text-left font-medium">{t("resumo.col.dia")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("cal.ingerido")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("cal.gasto")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("cal.defice")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("macro.proteina")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("macro.hidratosCurto")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("macro.gordura")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("perfil.peso")}</th>
                <th className="px-5 py-2 text-right font-medium">{t("ativ.sono")}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.dia} className={`border-b border-line last:border-0 ${r.kcal == null ? "text-muted" : ""}`}>
                  <td className="px-5 py-2.5 first-letter:uppercase">{dayLabel(r.dia)}</td>
                  {r.kcal == null ? (
                    <td colSpan={6} className="px-3 text-center text-xs italic">
                      {t("resumo.semRegisto")}
                    </td>
                  ) : (
                    <>
                      <td className="px-3 text-right font-medium">{fmtN(r.kcal)}</td>
                      <td className="px-3 text-right">{r.gasto != null ? fmtN(r.gasto) : "–"}</td>
                      <td className={`px-3 text-right font-semibold ${r.deficit == null ? "" : r.deficit >= 0 ? "text-good" : "text-warn"}`}>
                        {r.deficit != null ? `${r.deficit < 0 ? "+" : ""}${fmtN(Math.abs(r.deficit))}` : "–"}
                      </td>
                      <td className="px-3 text-right">{Math.round(r.protein ?? 0)} g</td>
                      <td className="px-3 text-right">{Math.round(r.carbs ?? 0)} g</td>
                      <td className="px-3 text-right">{Math.round(r.fat ?? 0)} g</td>
                    </>
                  )}
                  <td className="px-3 text-right">{r.peso != null ? fmtN(r.peso, 1) : "–"}</td>
                  <td className="px-5 text-right">{r.sono ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Telemóvel: cartões por dia */}
        <ul className="divide-y divide-line md:hidden">
          {[...rows].reverse().map((r) => (
            <li key={r.dia} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium first-letter:uppercase">{dayLabel(r.dia)}</span>
                {r.kcal == null ? (
                  <span className="text-xs italic text-muted">{t("resumo.semRegisto")}</span>
                ) : (
                  <span className="tabular text-sm">
                    <span className="font-semibold">{fmtN(r.kcal)}</span>
                    <span className="text-muted"> / {r.gasto != null ? fmtN(r.gasto) : "–"} kcal</span>
                  </span>
                )}
              </div>
              {r.kcal != null && (
                <div className="tabular mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {r.deficit != null && (
                    <span className={`font-semibold ${r.deficit >= 0 ? "text-good" : "text-warn"}`}>
                      {r.deficit >= 0 ? t("cal.defice") : t("cal.excedente")} {fmtN(Math.abs(r.deficit))}
                    </span>
                  )}
                  <span>
                    {t("macro.p")} {Math.round(r.protein ?? 0)} · {t("macro.c")} {Math.round(r.carbs ?? 0)} · {t("macro.g")} {Math.round(r.fat ?? 0)} g
                  </span>
                  {r.peso != null && <span>{fmtN(r.peso, 1)} kg</span>}
                  {r.sono != null && <span>{t("resumo.sonoN", { n: r.sono })}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>

      {profile && !profile.altura_cm && <p className="text-xs text-muted">{t("resumo.completePerfil")}</p>}
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  estimate,
  hint,
  tone,
  className = "",
  estLabel,
}: {
  estLabel: string;
  label: string;
  value: string;
  unit: string;
  estimate?: boolean;
  hint?: string;
  tone?: "good" | "warn";
  className?: string;
}) {
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{label}</span>
        {estimate && <span className="rounded-md border border-line px-1.5 py-px text-[10px] font-medium uppercase">{estLabel}</span>}
      </div>
      <div className={`mt-1.5 text-2xl font-bold tracking-tight ${tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{unit}</div>
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
