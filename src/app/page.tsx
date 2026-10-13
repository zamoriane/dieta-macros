"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildAlerts, type Alert } from "@/lib/nutrition";
import {
  addDays,
  addLogItem,
  applyPlanToDay,
  avgOuraActive,
  computeDay,
  ensureDay,
  getDayItems,
  getActivityDays,
  getHealthDays,
  type HealthDayRow,
  getPlan,
  getProfile,
  isoDay,
  latestWeight,
  profileComplete,
  sum,
  updateLogGrams,
  type LogItem,
  type OuraDay,
  type Profile,
} from "@/lib/data";
import { FoodPicker } from "@/components/FoodPicker";
import { DaySummary } from "@/components/Summary";

const fmtDay = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });

export default function HojePage() {
  const sb = useMemo(() => createClient(), []);
  const today = isoDay();
  const [dia, setDia] = useState(today);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<LogItem[]>([]);
  const [dayExists, setDayExists] = useState(true);
  const [weight, setWeight] = useState<{ dia: string; kg: number } | null>(null);
  const [oura, setOura] = useState<OuraDay | null>(null);
  const [lowStreak, setLowStreak] = useState(0);
  const [planMeals, setPlanMeals] = useState<{ nome: string; posicao: number }[]>([]);
  const [planItemCount, setPlanItemCount] = useState(0);
  const [avgActive, setAvgActive] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthDayRow | null>(null);
  const [picker, setPicker] = useState<{ meal: string; pos: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const p = await getProfile(sb);
      setProfile(p);
      if (dia === today) await ensureDay(sb, dia);
      const { data: d } = await sb.from("days").select("dia").eq("dia", dia).maybeSingle();
      setDayExists(!!d);
      const src = p.fonte_atividade ?? "oura";
      const [its, w, od, plan, prev, avg, hd] = await Promise.all([
        getDayItems(sb, dia),
        latestWeight(sb, dia),
        getActivityDays(sb, dia, dia, src),
        getPlan(sb),
        sb.from("daily_totals").select("dia,kcal").gte("dia", addDays(dia, -7)).lt("dia", dia).order("dia", { ascending: false }),
        avgOuraActive(sb, dia, 14, src),
        getHealthDays(sb, dia, dia),
      ]);
      setHealth(hd[0] ?? null);
      setAvgActive(avg);
      setPlanItemCount(plan.items.length);
      setItems(its);
      setWeight(w);
      setOura(od[0] ?? null);
      setPlanMeals(plan.meals.map((m) => ({ nome: m.nome, posicao: m.posicao })));
      let streak = 0;
      for (const r of prev.data ?? []) {
        if (Number(r.kcal) < p.kcal_minimo) streak++;
        else break;
      }
      setLowStreak(streak);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sb, dia, today]);

  useEffect(() => {
    load();
  }, [load]);

  // Sincroniza o Oura ao abrir, no máximo uma vez por hora.
  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem("ouraSync") ?? 0);
    } catch {}
    if (Date.now() - last < 3600_000) return;
    fetch("/api/oura/sync", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        try {
          localStorage.setItem("ouraSync", String(Date.now()));
        } catch {}
        if (j.connected && j.days) load();
      })
      .catch(() => {});
  }, [load]);

  const totals = sum(items);
  const calc = profile ? computeDay(profile, weight?.kg ?? null, totals, oura, dia, { isToday: dia === today, avgActive }) : null;

  const alerts: Alert[] = calc
    ? buildAlerts({
        totals,
        targets: calc.targets,
        balance: calc.balance,
        hour: new Date().getHours(),
        isToday: dia === today,
        lowIntakeStreak: lowStreak,
        minKcal: profile!.kcal_minimo,
        hasWeightLast7d: !!weight && weight.dia >= addDays(today, -7),
        sleepScore: oura?.sleep_score,
      })
    : [];

  // Refeições: as do dia + as do plano que ainda não têm itens
  const meals = new Map<string, { pos: number; items: LogItem[] }>();
  for (const pm of planMeals) meals.set(pm.nome, { pos: pm.posicao, items: [] });
  for (const it of items) {
    if (!meals.has(it.refeicao)) meals.set(it.refeicao, { pos: it.refeicao_pos, items: [] });
    meals.get(it.refeicao)!.items.push(it);
  }
  const mealList = [...meals.entries()].sort((a, b) => a[1].pos - b[1].pos);

  async function remove(id: number) {
    await sb.from("log_items").delete().eq("id", id);
    load();
  }

  async function editGrams(item: LogItem) {
    const v = prompt(`Quantidade de ${item.food_name} (g)`, String(item.gramas));
    const g = Number((v ?? "").replace(",", "."));
    if (!v || !(g > 0)) return;
    await updateLogGrams(sb, item, g);
    load();
  }

  async function newMeal() {
    const nome = prompt("Nome da refeição (ex.: Lanche da tarde)");
    if (!nome?.trim()) return;
    const pos = Math.max(0, ...mealList.map(([, m]) => m.pos)) + 1;
    setPicker({ meal: nome.trim(), pos });
  }

  async function createFromPlan() {
    await ensureDay(sb, dia, true);
    load();
  }

  async function fillFromPlan() {
    await applyPlanToDay(sb, dia);
    load();
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <button className="rounded-full px-3 py-1 text-lg text-muted" onClick={() => setDia(addDays(dia, -1))} aria-label="Dia anterior">
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-lg font-semibold capitalize">{dia === today ? "Hoje" : fmtDay(dia)}</h1>
          {dia !== today && (
            <button className="text-xs text-accent" onClick={() => setDia(today)}>
              voltar para hoje
            </button>
          )}
          {dia === today && <p className="text-xs capitalize text-muted">{fmtDay(dia)}</p>}
        </div>
        <button
          className="rounded-full px-3 py-1 text-lg text-muted disabled:opacity-30"
          disabled={dia >= today}
          onClick={() => setDia(addDays(dia, 1))}
          aria-label="Dia seguinte"
        >
          ›
        </button>
      </header>

      {error && <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad">{error}</p>}

      {profile && (!profileComplete(profile) || !weight) && (
        <Link href="/perfil" className="block rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          Complete o perfil (sexo, nascimento, altura) e registe o peso para ver metas, gasto e défice. →
        </Link>
      )}

      {alerts.length > 0 && (
        <ul className="space-y-2">
          {alerts.map((a, i) => (
            <li
              key={i}
              className={`rounded-xl border p-3 text-sm ${
                a.level === "alerta" ? "border-bad/40 bg-bad/10" : a.level === "aviso" ? "border-warn/40 bg-warn/10" : "border-line bg-card"
              }`}
            >
              {a.text}
            </li>
          ))}
        </ul>
      )}

      {!loading && dayExists && items.length === 0 && planItemCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          <span>Este dia está vazio.</span>
          <button className="shrink-0 rounded-lg bg-accent px-3 py-1.5 font-medium text-white" onClick={fillFromPlan}>
            Aplicar plano base
          </button>
        </div>
      )}

      <DaySummary totals={totals} targets={calc?.targets} balance={calc?.balance} projected={calc?.projected}
        liveActivity={calc?.liveActivity}
        sourceName={profile?.fonte_atividade === "apple" ? "Apple Watch" : "Oura"}
      />

      {oura && (
        <section className="tabular grid grid-cols-4 gap-2 text-center text-sm">
          <Mini label="Sono" value={oura.sleep_score} />
          <Mini label="Prontidão" value={oura.readiness_score} />
          <Mini label="Passos" value={oura.steps} />
          <Mini label="Stress alto" value={oura.stress_high_min != null ? `${oura.stress_high_min}m` : null} />
        </section>
      )}

      {health && (health.workouts?.length > 0 || health.exercise_min != null) && (
        <section className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
          <div className="flex justify-between text-xs text-muted">
            <span>Apple Watch</span>
            <span className="tabular">
              {health.active_kcal != null && `${health.active_kcal} kcal ativas`}
              {health.exercise_min != null && ` · ${health.exercise_min} min exercício`}
            </span>
          </div>
          {health.workouts?.map((w, i) => (
            <div key={i} className="tabular mt-1 flex justify-between">
              <span>{w.name}</span>
              <span className="text-muted">
                {w.min != null && `${w.min} min`}
                {w.kcal != null && ` · ${w.kcal} kcal`}
              </span>
            </div>
          ))}
        </section>
      )}

      {!loading && !dayExists && dia !== today && (
        <div className="rounded-xl border border-line bg-card p-4 text-sm">
          Sem registo neste dia.{" "}
          <button className="text-accent" onClick={createFromPlan}>
            Criar a partir do plano base
          </button>
        </div>
      )}

      {mealList.length === 0 && !loading && (
        <div className="rounded-xl border border-line bg-card p-4 text-sm text-muted">
          Ainda não há plano base. <Link href="/plano" className="text-accent">Montar o plano</Link> ou adicione uma refeição abaixo.
        </div>
      )}

      {mealList.map(([nome, m]) => {
        const t = sum(m.items);
        return (
          <section key={nome} className="rounded-2xl border border-line bg-card">
            <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
              <h2 className="font-medium">{nome}</h2>
              <span className="tabular text-xs text-muted">
                {t.kcal} kcal · P {Math.round(t.protein)} · C {Math.round(t.carbs)} · G {Math.round(t.fat)}
              </span>
            </div>
            <ul className="divide-y divide-line">
              {m.items.map((it) => {
                const diff = it.gramas_plano != null ? Number(it.gramas) - Number(it.gramas_plano) : null;
                return (
                  <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button className="min-w-0 flex-1 text-left" onClick={() => editGrams(it)}>
                      <div className="truncate text-sm">{it.food_name}</div>
                      <div className="tabular text-xs text-muted">
                        {Number(it.gramas)} g
                        {diff ? <span className="text-warn"> ({diff > 0 ? "+" : ""}{diff} g vs plano)</span> : null}
                        {it.gramas_plano == null && <span className="text-accent"> · extra</span>}
                      </div>
                    </button>
                    <div className="tabular text-right text-sm">
                      {Math.round(it.kcal)}
                      <div className="text-xs text-muted">P {Math.round(it.protein)}</div>
                    </div>
                    <button className="px-1 text-muted hover:text-bad" onClick={() => remove(it.id)} aria-label="Remover">
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
            <button className="w-full px-4 py-2.5 text-left text-sm text-accent" onClick={() => setPicker({ meal: nome, pos: m.pos })}>
              + Adicionar a {nome}
            </button>
          </section>
        );
      })}

      <button className="w-full rounded-2xl border border-dashed border-line py-3 text-sm text-muted" onClick={newMeal}>
        + Outra refeição
      </button>

      {picker && (
        <FoodPicker
          title={`Adicionar a ${picker.meal}`}
          onClose={() => setPicker(null)}
          onPick={async (food, grams) => {
            await addLogItem(sb, dia, picker.meal, picker.pos, food, grams);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="rounded-xl border border-line bg-card py-2">
      <div className="font-semibold">{value ?? "–"}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
