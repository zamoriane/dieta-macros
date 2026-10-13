"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { adaptiveTdee, KCAL_PER_KG } from "@/lib/nutrition";
import { addDays, computeDay, getProfile, isoDay, type OuraDay, type Profile } from "@/lib/data";

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
  const sb = useMemo(() => createClient(), []);
  const [period, setPeriod] = useState<Period>("semana");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [tdee, setTdee] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [from, to] = range(period, offset);
  const today = isoDay();

  useEffect(() => {
    (async () => {
      const p = await getProfile(sb);
      setProfile(p);
      const histFrom = addDays(from < addDays(today, -28) ? from : addDays(today, -28), -30);
      const [{ data: totals }, { data: oura }, { data: weights }] = await Promise.all([
        sb.from("daily_totals").select("*").gte("dia", histFrom).lte("dia", to < today ? to : today),
        sb.from("oura_daily").select("*").gte("dia", from).lte("dia", to),
        sb.from("weights").select("dia,kg").gte("dia", histFrom).lte("dia", to).order("dia"),
      ]);
      const tByDay = new Map((totals ?? []).map((t) => [t.dia as string, t]));
      const oByDay = new Map(((oura ?? []) as OuraDay[]).map((o) => [o.dia, o]));
      const ws = (weights ?? []).map((w) => ({ dia: w.dia as string, kg: Number(w.kg) }));
      const weightAt = (dia: string) => [...ws].reverse().find((w) => w.dia <= dia)?.kg ?? null;

      const out: Row[] = [];
      for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
        const t = tByDay.get(d);
        const o = oByDay.get(d) ?? null;
        const kg = weightAt(d);
        const totalsM = t
          ? { kcal: Number(t.kcal), protein: Number(t.protein), carbs: Number(t.carbs), fat: Number(t.fat), fiber: Number(t.fiber) }
          : null;
        const calc = totalsM ? computeDay(p, kg, totalsM, o, d) : null;
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
    })();
  }, [sb, from, to, today]);

  const logged = rows.filter((r) => r.kcal != null);
  const avg = (k: keyof Row) => {
    const v = logged.map((r) => r[k] as number | null).filter((x): x is number => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const deficitSum = logged.reduce((s, r) => s + (r.deficit ?? 0), 0);
  const pesos = rows.filter((r) => r.peso != null);
  const pesoDelta = pesos.length >= 2 ? pesos[pesos.length - 1].peso! - pesos[0].peso! : null;
  const maxKcal = Math.max(1, ...rows.map((r) => Math.max(r.kcal ?? 0, r.gasto ?? 0)));

  const label =
    period === "semana"
      ? `${new Date(from + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })} – ${new Date(to + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}`
      : new Date(from + "T12:00:00").toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Resumo</h1>
        <div className="flex rounded-xl border border-line bg-card p-0.5 text-sm">
          {(["semana", "mes"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                setOffset(0);
              }}
              className={`rounded-lg px-3 py-1 ${period === p ? "bg-accent text-white" : "text-muted"}`}
            >
              {p === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex items-center justify-between">
        <button className="px-3 text-lg text-muted" onClick={() => setOffset(offset - 1)}>
          ‹
        </button>
        <span className="text-sm font-medium capitalize">{label}</span>
        <button className="px-3 text-lg text-muted disabled:opacity-30" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>
          ›
        </button>
      </div>

      <section className="tabular grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Média ingerida" value={avg("kcal")} unit="kcal" />
        <Kpi label="Proteína média" value={avg("protein")} unit="g" />
        <Kpi label="Défice acumulado" value={logged.length ? deficitSum : null} unit="kcal" good={deficitSum > 0} />
        <Kpi
          label="≈ gordura (estim.)"
          value={logged.length ? Math.round((deficitSum / KCAL_PER_KG) * 100) / 100 : null}
          unit="kg"
          hint={pesoDelta != null ? `Balança: ${pesoDelta > 0 ? "+" : ""}${pesoDelta.toFixed(1)} kg` : undefined}
        />
      </section>

      {tdee != null && (
        <p className="rounded-xl border border-line bg-card p-3 text-sm">
          Gasto real estimado pela evolução do peso (28 dias): <strong className="tabular">{tdee} kcal/dia</strong>. Se for muito
          diferente do gasto calculado, ajuste o fator de correção da atividade no perfil.
        </p>
      )}

      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="mb-2 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded bg-accent" /> ingerido
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded bg-line" /> gasto
          </span>
        </div>
        <div className="flex h-40 items-end gap-1">
          {rows.map((r) => (
            <div key={r.dia} className="relative flex h-full flex-1 items-end" title={`${r.dia}: ${r.kcal ?? "–"} / ${r.gasto ?? "–"} kcal`}>
              <div className="absolute bottom-0 w-full rounded-t bg-line" style={{ height: `${((r.gasto ?? 0) / maxKcal) * 100}%` }} />
              <div
                className={`relative mx-auto w-2/3 rounded-t ${r.deficit != null && r.deficit < 0 ? "bg-bad" : "bg-accent"}`}
                style={{ height: `${((r.kcal ?? 0) / maxKcal) * 100}%` }}
              />
            </div>
          ))}
        </div>
        {period === "semana" && (
          <div className="mt-1 flex gap-1 text-center text-[10px] text-muted">
            {rows.map((r) => (
              <span key={r.dia} className="flex-1">
                {new Date(r.dia + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "short" }).slice(0, 3)}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="tabular w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2 text-left font-normal">Dia</th>
              <th className="px-2 py-2 text-right font-normal">kcal</th>
              <th className="px-2 py-2 text-right font-normal">P</th>
              <th className="px-2 py-2 text-right font-normal">C</th>
              <th className="px-2 py-2 text-right font-normal">G</th>
              <th className="px-2 py-2 text-right font-normal">Défice</th>
              <th className="px-2 py-2 text-right font-normal">Peso</th>
              <th className="px-3 py-2 text-right font-normal">Sono</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dia} className="border-b border-line last:border-0">
                <td className="px-3 py-1.5">{new Date(r.dia + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "short", day: "numeric" })}</td>
                <td className="px-2 text-right">{r.kcal ?? "–"}</td>
                <td className="px-2 text-right">{r.protein != null ? Math.round(r.protein) : "–"}</td>
                <td className="px-2 text-right">{r.carbs != null ? Math.round(r.carbs) : "–"}</td>
                <td className="px-2 text-right">{r.fat != null ? Math.round(r.fat) : "–"}</td>
                <td className={`px-2 text-right ${r.deficit == null ? "" : r.deficit >= 0 ? "text-good" : "text-bad"}`}>{r.deficit ?? "–"}</td>
                <td className="px-2 text-right">{r.peso?.toFixed(1) ?? "–"}</td>
                <td className="px-3 text-right">{r.sono ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {profile && !profile.altura_cm && <p className="text-xs text-muted">Complete o perfil para ver gasto e défice.</p>}
    </div>
  );
}

function Kpi({ label, value, unit, good, hint }: { label: string; value: number | null; unit: string; good?: boolean; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-semibold ${good === undefined ? "" : good ? "text-good" : "text-bad"}`}>
        {value ?? "–"} {value != null && <span className="text-xs font-normal text-muted">{unit}</span>}
      </div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
