"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildAlerts, waterReference, type Alert } from "@/lib/nutrition";
import {
  addDays,
  addLogItem,
  applyPlanToDay,
  avgOuraActive,
  computeDay,
  ensureDay,
  getActivityDays,
  getDayItems,
  getHealthDays,
  getPlan,
  getProfile,
  getUserId,
  isoDay,
  latestWeight,

  updateLogGrams,
  hasStates,
  setDayComplete,
  setItemsState,
  type HealthDayRow,
  type LogItem,
  type OuraDay,
  type Profile,
} from "@/lib/data";
import { FoodPicker, GramsInput, MacroPreview } from "@/components/FoodPicker";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { DateNavigator, EmptyState, FormField, Skeleton } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { CalorieCard } from "@/components/hoje/CalorieCard";
import { MacroCard } from "@/components/hoje/MacroCard";
import { ActivityCard } from "@/components/hoje/ActivityCard";
import { MealCard } from "@/components/hoje/MealCard";
import { AlertsBar } from "@/components/hoje/AlertsBar";
import { useI18n } from "@/lib/i18n/client";
import { dayStatus, dayTotals, isConsumed, mealConfirmTargets, rowStatus, type DailyTotalsRow, type ItemState } from "@/lib/consumption";
import { getWaterLogs, type WaterLog } from "@/lib/waterData";
import { effectiveMl, goalMl as waterGoal, parseConfig as parseWater } from "@/lib/water";
import { syncFromLogs } from "@/lib/waterReminders";
import { autoSyncHealth } from "@/lib/nativeHealthClient";

function greeting(t: ReturnType<typeof useI18n>["t"], name?: string | null) {
  const h = new Date().getHours();
  const g = h < 12 ? t("hoje.bomDia") : h < 19 ? t("hoje.boaTarde") : t("hoje.boaNoite");
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${g}, ${first}` : g;
}

/** Cópia de um item sem os campos gerados pelo banco. */
function strip(it: LogItem) {
  const rest: Record<string, unknown> = { ...it };
  delete rest.id;
  delete rest.criado_em;
  return rest;
}

/** Item copiado de outro dia por ação do utilizador: entra como extra consumido (a base de dados confirma). */
function asNewConsumed(it: LogItem) {
  const rest = strip(it);
  for (const k of ["estado", "estado_origem", "confirmado_em", "alterado_em"]) delete rest[k];
  rest.gramas_plano = null;
  return rest;
}

export default function HojePage() {
  const { t, df, nf } = useI18n();
  const fmtLong = (iso: string) => df(iso, { weekday: "long", day: "numeric", month: "long" });
  const fmtShort = (iso: string) => df(iso, { weekday: "short", day: "numeric", month: "short" });
  const sb = useMemo(() => createClient(), []);
  const today = isoDay();
  const [dia, setDia] = useState(today);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<LogItem[]>([]);
  const [yItems, setYItems] = useState<LogItem[]>([]);
  const [dayExists, setDayExists] = useState(true);
  const [dayComplete, setDayComplete_] = useState<boolean | null>(null);
  const [weight, setWeight] = useState<{ dia: string; kg: number } | null>(null);
  const [oura, setOura] = useState<OuraDay | null>(null);
  const [health, setHealth] = useState<HealthDayRow | null>(null);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [lowStreak, setLowStreak] = useState(0);
  const [planMeals, setPlanMeals] = useState<{ nome: string; posicao: number }[]>([]);
  const [planItemCount, setPlanItemCount] = useState(0);
  const [avgActive, setAvgActive] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [picker, setPicker] = useState<{ meal: string; pos: number } | null>(null);
  const [editing, setEditing] = useState<LogItem | null>(null);
  const [editGrams, setEditGrams] = useState("");
  const [newMealOpen, setNewMealOpen] = useState(false);
  const [newMealName, setNewMealName] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const p = await getProfile(sb);
      setProfile(p);
      const uid = p.id;
      if (dia === today) await ensureDay(sb, dia);
      const { data: d } = await sb.from("days").select("*").eq("user_id", uid).eq("dia", dia).maybeSingle();
      setDayExists(!!d);
      setDayComplete_(d && "completo" in d ? !!d.completo : null);
      const src = p.fonte_atividade ?? "oura";
      const [its, yits, w, od, plan, prev, avg, hd] = await Promise.all([
        getDayItems(sb, dia),
        getDayItems(sb, addDays(dia, -1)),
        latestWeight(sb, dia),
        getActivityDays(sb, dia, dia, src),
        getPlan(sb),
        sb.from("daily_totals").select("*").eq("user_id", uid).gte("dia", addDays(dia, -7)).lt("dia", dia).order("dia", { ascending: false }),
        avgOuraActive(sb, dia, 14, src),
        getHealthDays(sb, dia, dia),
      ]);
      setWaterLogs(await getWaterLogs(sb, uid, dia, dia).catch(() => []));
      setItems(its);
      setYItems(yits);
      setWeight(w);
      setOura(od[0] ?? null);
      setHealth(hd[0] ?? null);
      setAvgActive(avg);
      setPlanItemCount(plan.items.length);
      setPlanMeals(plan.meals.map((m) => ({ nome: m.nome, posicao: m.posicao })));
      let streak = 0;
      // Só contam dias com registo completo; um dia parcial ou sem registo interrompe a contagem
      for (const r of (prev.data ?? []) as DailyTotalsRow[]) {
        if (rowStatus(r, today) === "completo" && Number(r.kcal) < p.kcal_minimo) streak++;
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

  // Na app nativa: lê a Apple Saúde / Health Connect ao abrir (no máximo de 30 em 30 min).
  useEffect(() => {
    autoSyncHealth()
      .then((did) => {
        if (did) load();
      })
      .catch(() => {});
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

  const isToday = dia === today;
  const source = profile?.fonte_atividade ?? "oura";
  const dt = dayTotals(items);
  const totals = dt.consumed; // só o consumo confirmado conta como ingerido
  const statesOn = hasStates(items);
  const status = dayStatus({ nConsumed: dt.nConsumed, nPending: dt.nPending, completo: dayComplete, isPast: !isToday });
  const calc = profile ? computeDay(profile, weight?.kg ?? null, totals, oura, dia, { isToday, avgActive }) : null;

  const alerts: Alert[] = calc
    ? buildAlerts({
        totals,
        targets: calc.targets,
        balance: calc.balance,
        hour: new Date().getHours(),
        isToday,
        lowIntakeStreak: lowStreak,
        minKcal: profile!.kcal_minimo,
        hasWeightLast7d: !!weight && weight.dia >= addDays(today, -7),
        sleepScore: oura?.sleep_score,
        pendingKcal: statesOn ? dt.pending.kcal : 0,
        complete: status === "completo",
      })
    : [];

  // Referência de água: gasto do dia + minutos de treino (Watch)
  const workoutMin = (health?.workouts ?? []).reduce((s, w) => s + (w.min ?? 0), 0) || health?.exercise_min || 0;
  const waterRef = profile ? waterReference({ sex: profile.sexo, expenditureKcal: calc?.balance.expenditure, exerciseMin: workoutMin }) : undefined;
  const waterCfg = useMemo(() => parseWater(profile?.agua), [profile]);
  const waterGoalMl = waterGoal(waterCfg, waterRef?.drinks);
  const water = waterRef
    ? { ...waterRef, consumedMl: waterLogs.reduce((s, l) => s + effectiveMl(l.ml, l.fator), 0), goalMl: waterGoalMl, href: isToday ? "/agua" : `/agua?dia=${dia}` }
    : undefined;

  // Lembretes de água (app nativa): reagenda ao abrir o Hoje, com o que já se bebeu hoje
  useEffect(() => {
    if (!profile || !isToday || !waterCfg.lembretes.ativo) return;
    syncFromLogs(waterCfg.lembretes, waterLogs, waterGoalMl, t, (n) => nf(n));
  }, [profile, isToday, waterCfg, waterLogs, waterGoalMl, t, nf]);

  // Refeições: as do plano (mesmo vazias) + as que só existem no dia
  const meals = new Map<string, { pos: number; items: LogItem[] }>();
  for (const pm of planMeals) meals.set(pm.nome, { pos: pm.posicao, items: [] });
  for (const it of items) {
    if (!meals.has(it.refeicao)) meals.set(it.refeicao, { pos: it.refeicao_pos, items: [] });
    meals.get(it.refeicao)!.items.push(it);
  }
  const mealList = [...meals.entries()].sort((a, b) => a[1].pos - b[1].pos);

  // ---------- ações ----------
  async function remove(it: LogItem) {
    const { error: e } = await sb.from("log_items").delete().eq("id", it.id);
    if (e) return toast(t("hoje.erroRemover"), { kind: "erro" });
    await load();
    toast(t("hoje.removido", { nome: it.food_name }), {
      action: {
        label: t("comum.desfazer"),
        run: async () => {
          const userId = await getUserId(sb);
          await sb.from("log_items").insert({ ...strip(it), user_id: userId });
          load();
        },
      },
    });
  }

  function openEdit(it: LogItem) {
    setEditing(it);
    setEditGrams(String(Number(it.gramas)));
  }

  async function saveEdit() {
    if (!editing) return;
    const g = Number(editGrams.replace(",", "."));
    if (!(g > 0)) return;
    try {
      await updateLogGrams(sb, editing, g);
      setEditing(null);
      await load();
      toast(t("hoje.qtdAtualizada"));
    } catch {
      toast(t("comum.erroGuardar"), { kind: "erro" });
    }
  }

  async function repeatYesterday(meal: string, pos: number) {
    // só o que ontem foi realmente comido (confirmado); o planeado não confirmado não se repete
    const src = yItems.filter((y) => y.refeicao === meal && isConsumed(y));
    if (!src.length) return;
    await ensureDay(sb, dia, false);
    const userId = await getUserId(sb);
    const { error: e } = await sb.from("log_items").insert(src.map((y) => ({ ...asNewConsumed(y), user_id: userId, dia, refeicao_pos: pos })));
    if (e) return toast(t("hoje.erroCopiar"), { kind: "erro" });
    await load();
    toast(t("hoje.copiadoOntem", { nome: meal }));
  }

  async function setStates(ids: number[], estado: ItemState, msg?: string, undo?: () => void) {
    if (!ids.length) return;
    try {
      await setItemsState(sb, ids, estado);
      await load();
      if (msg) toast(msg, undo ? { action: { label: t("comum.desfazer"), run: undo } } : {});
    } catch {
      toast(t("comum.erroGuardar"), { kind: "erro" });
    }
  }

  function confirmMeal(meal: string, its: LogItem[], confirm: boolean) {
    const ids = mealConfirmTargets(its, confirm);
    if (confirm) {
      const prevById = new Map(its.map((i) => [i.id, i.estado ?? "consumido"]));
      setStates(ids, "consumido", t("consumo.refeicaoConfirmada", { nome: meal }), async () => {
        // repõe o estado anterior de cada item (planeado ou legado)
        const back = new Map<ItemState, number[]>();
        for (const id of ids) {
          const st = prevById.get(id) as ItemState;
          back.set(st, [...(back.get(st) ?? []), id]);
        }
        for (const [st, list] of back) await setItemsState(sb, list, st);
        load();
      });
    } else {
      setStates(ids, "planeado", t("consumo.confirmacaoDesfeita", { nome: meal }));
    }
  }

  async function toggleComplete() {
    try {
      await setDayComplete(sb, dia, !dayComplete);
      setDayComplete_(!dayComplete);
      toast(!dayComplete ? t("consumo.diaCompletoOk") : t("consumo.diaReaberto"));
    } catch {
      toast(t("comum.erroGuardar"), { kind: "erro" });
    }
  }

  async function fillFromPlan() {
    await ensureDay(sb, dia, false);
    const n = await applyPlanToDay(sb, dia);
    await load();
    toast(t("hoje.planoAplicado", { n }));
  }

  function createMeal() {
    const nome = newMealName.trim();
    if (!nome) return;
    const pos = Math.max(0, ...mealList.map(([, m]) => m.pos)) + 1;
    setNewMealOpen(false);
    setNewMealName("");
    setPicker({ meal: nome, pos });
  }

  // ---------- render ----------
  const eg = Number(editGrams.replace(",", "."));
  const editPreview =
    editing && eg > 0
      ? {
          kcal: (editing.kcal * eg) / Number(editing.gramas),
          protein: Math.round(((editing.protein * eg) / Number(editing.gramas)) * 10) / 10,
          carbs: Math.round(((editing.carbs * eg) / Number(editing.gramas)) * 10) / 10,
          fat: Math.round(((editing.fat * eg) / Number(editing.gramas)) * 10) / 10,
        }
      : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{isToday ? greeting(t, profile?.nome) : t("hoje.registoDia")}</h1>
          <p className="text-sm text-muted first-letter:uppercase">{fmtLong(dia)}</p>
        </div>
        <div className="card px-1 py-1">
          <DateNavigator
            label={isToday ? t("comum.hoje") : fmtShort(dia)}
            onPrev={() => setDia(addDays(dia, -1))}
            onNext={() => setDia(addDays(dia, 1))}
            nextDisabled={dia >= today}
            onToday={() => setDia(today)}
            isToday={isToday}
          />
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-sm">
          <Icon name="alert" size={18} className="text-bad" />
          <span className="flex-1">{error}</span>
          <button className="font-semibold text-accent" onClick={load}>
            {t("comum.tentarDeNovo")}
          </button>
        </div>
      )}

      <AlertsBar alerts={alerts} />

      {!loading && items.length === 0 && planItemCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
          <span className="font-medium">{dayExists ? t("hoje.diaVazio") : t("hoje.semRegisto")}</span>
          <button className="btn btn-primary !min-h-10" onClick={fillFromPlan}>
            <Icon name="plan" size={18} /> {t("hoje.aplicarPlano")}
          </button>
        </div>
      )}

      {loading && !profile ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-5">
            <Skeleton className="h-56" />
            <Skeleton className="h-44" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0 space-y-5 lg:sticky lg:top-24">
            <CalorieCard
              totals={totals}
              targets={calc?.targets}
              balance={calc?.balance}
              projected={calc?.projected}
              liveActivity={calc?.liveActivity}
              source={source}
              deficitTarget={profile?.deficit_alvo_kcal}
              isToday={isToday}
              planned={statesOn ? dt.planned.kcal : undefined}
              pending={statesOn ? dt.pending.kcal : undefined}
              status={statesOn ? status : undefined}
            />
            <MacroCard totals={totals} targets={calc?.targets} sex={profile?.sexo} water={water} />
            <ActivityCard oura={oura} health={health} source={source} />
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("hoje.refeicoes")}</h2>
              <button className="btn btn-ghost !min-h-10 !px-3" onClick={() => setNewMealOpen(true)}>
                <Icon name="plus" size={18} /> {t("hoje.refeicao")}
              </button>
            </div>

            {mealList.length === 0 && !loading && (
              <EmptyState icon="plan" title={t("hoje.semRefeicoes")}>
                {t("hoje.monteO")}{" "}
                <Link className="font-medium text-accent" href="/plano">
                  {t("nav.plano")}
                </Link>
                {t("hoje.ouAdicione")}
              </EmptyState>
            )}

            {mealList.map(([nome, m]) => (
              <MealCard
                key={`${dia}-${nome}`}
                name={nome}
                items={m.items}
                onAdd={() => setPicker({ meal: nome, pos: m.pos })}
                onEdit={openEdit}
                onRemove={remove}
                onRepeat={() => repeatYesterday(nome, m.pos)}
                repeatCount={yItems.filter((y) => y.refeicao === nome && isConsumed(y)).length}
                states={statesOn}
                onConfirmMeal={(confirm) => confirmMeal(nome, m.items, confirm)}
                onSetState={(it, st) => setStates([it.id], st)}
              />
            ))}

            {statesOn && dayComplete !== null && items.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                <span className="text-muted">
                  {status === "completo" ? t("consumo.estadoCompleto") : status === "parcial" ? t("consumo.estadoParcial") : t("consumo.estadoSemRegisto")}
                </span>
                <button className="btn btn-ghost !min-h-10" onClick={toggleComplete} aria-pressed={!!dayComplete}>
                  <Icon name="check" size={18} /> {dayComplete ? t("consumo.reabrirDia") : t("consumo.marcarCompleto")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {picker && (
        <FoodPicker
          title={t("hoje.adicionarA", { nome: picker.meal })}
          onClose={() => setPicker(null)}
          onPick={async (food, grams) => {
            await addLogItem(sb, dia, picker.meal, picker.pos, food, grams);
            await load();
            toast(t("hoje.adicionadoA", { alimento: food.name, nome: picker.meal }));
          }}
        />
      )}

      <ResponsiveDialog
        open={!!editing}
        title={editing?.food_name ?? ""}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setEditing(null)}>
              {t("comum.cancelar")}
            </button>
            <button className="btn btn-primary flex-1" onClick={saveEdit}>
              {t("comum.guardar")}
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <GramsInput value={editGrams} onChange={setEditGrams} />
            {editing.gramas_plano != null && Number(editing.gramas_plano) !== eg && (
              <button className="btn btn-ghost w-full !min-h-10 !text-xs" onClick={() => setEditGrams(String(Number(editing.gramas_plano)))}>
                {t("hoje.reporPlano", { g: Number(editing.gramas_plano) })}
              </button>
            )}
            {editPreview && <MacroPreview m={editPreview} />}
          </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={newMealOpen}
        title={t("hoje.novaRefeicao")}
        onClose={() => setNewMealOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setNewMealOpen(false)}>
              {t("comum.cancelar")}
            </button>
            <button className="btn btn-primary flex-1" disabled={!newMealName.trim()} onClick={createMeal}>
              {t("comum.continuar")}
            </button>
          </>
        }
      >
        <FormField label={t("comum.nome")} hint={t("hoje.novaRefeicaoDica")}>
          <input
            data-autofocus
            className="w-full"
            value={newMealName}
            onChange={(e) => setNewMealName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createMeal()}
          />
        </FormField>
      </ResponsiveDialog>
    </div>
  );
}
