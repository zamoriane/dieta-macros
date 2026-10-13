"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, isoDay } from "@/lib/data";
import { getLogs, getWorkout, lastSessions, setsSummary, type WorkoutDay, type WorkoutExercise, type WorkoutLog } from "@/lib/workouts";
import { prescription, repsDefault, WEEKDAYS } from "@/lib/wger";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { EmptyState, Skeleton } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { Thumb } from "./ExercisePicker";
import { ExerciseDetail } from "./ExerciseDetail";

type Draft = { reps: string; kg: string };

/** Treino do dia: o cliente regista cada série (repetições e carga) com descanso cronometrado. */
export function WorkoutSession({ ownerId, onEditPlan }: { ownerId: string; onEditPlan?: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const today = isoDay();
  const weekday = new Date().getDay();
  const [days, setDays] = useState<WorkoutDay[]>([]);
  const [exs, setExs] = useState<WorkoutExercise[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [dayId, setDayId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [extra, setExtra] = useState<Record<number, number>>({});
  const [info, setInfo] = useState<WorkoutExercise | null>(null);
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const [w, l] = await Promise.all([getWorkout(sb, ownerId), getLogs(sb, ownerId, addDays(today, -90))]);
    setDays(w.days);
    setExs(w.exercises);
    setLogs(l);
    setDayId((cur) => {
      if (cur && w.days.some((d) => d.id === cur)) return cur;
      const doneToday = l.find((x) => x.dia === today && x.workout_day_id)?.workout_day_id;
      return doneToday ?? w.days.find((d) => d.dias_semana.includes(weekday))?.id ?? w.days[0]?.id ?? null;
    });
    setLoaded(true);
  }, [sb, ownerId, today, weekday]);

  useEffect(() => {
    load().catch((e) => toast(`Não foi possível carregar o treino: ${(e as Error).message}`, { kind: "erro" }));
  }, [load]);

  useEffect(() => {
    if (!rest) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= rest.until) {
        setRest(null);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
        toast("Descanso terminado — próxima série!");
      }
    }, 250);
    return () => clearInterval(t);
  }, [rest]);

  const last = useMemo(() => lastSessions(logs, today), [logs, today]);
  const todayLogs = logs.filter((l) => l.dia === today);
  const day = days.find((d) => d.id === dayId) ?? null;
  const list = exs.filter((e) => e.workout_day_id === dayId);
  const doneSets = list.reduce((s, x) => s + todayLogs.filter((l) => l.workout_exercise_id === x.id).length, 0);
  const plannedSets = list.reduce((s, x) => s + (x.series ?? 0), 0);

  function draftFor(x: WorkoutExercise, serie: number): Draft {
    const key = `${x.id}-${serie}`;
    if (drafts[key]) return drafts[key];
    const prev = last.get(x.id)?.sets.find((s) => s.serie === serie) ?? last.get(x.id)?.sets.at(-1);
    const reps = prev?.reps ?? repsDefault(x.reps);
    const kg = prev?.carga_kg ?? x.carga_kg;
    return { reps: reps != null ? String(reps) : "", kg: kg != null ? String(kg) : "" };
  }

  async function logSet(x: WorkoutExercise, serie: number) {
    const d = draftFor(x, serie);
    const reps = d.reps.trim() === "" ? null : Math.round(Number(d.reps.replace(",", ".")));
    const kg = d.kg.trim() === "" ? null : Number(d.kg.replace(",", "."));
    if ((reps != null && !(reps >= 0 && reps <= 500)) || (kg != null && !(kg >= 0 && kg < 10000))) return toast("Valores inválidos", { kind: "erro" });
    const { error } = await sb.from("workout_logs").insert({
      user_id: ownerId,
      dia: today,
      workout_day_id: x.workout_day_id,
      workout_exercise_id: x.id,
      exercise_id: x.exercise_id,
      nome: x.nome,
      serie,
      reps,
      carga_kg: kg,
    });
    if (error) return toast(error.message, { kind: "erro" });
    if (x.descanso_s) setRest({ until: Date.now() + x.descanso_s * 1000, total: x.descanso_s });
    setNow(Date.now());
    load();
  }

  async function undoSet(l: WorkoutLog) {
    const { error } = await sb.from("workout_logs").delete().eq("id", l.id);
    if (error) return toast(error.message, { kind: "erro" });
    load();
  }

  if (!loaded) return <Skeleton className="h-64" />;

  if (!days.length) {
    return (
      <EmptyState icon="dumbbell" title="Ainda não há plano de treino">
        O seu treinador pode criar o plano para si, ou pode criá-lo em “Plano de treino”.
        {onEditPlan && (
          <button className="btn btn-primary mt-3" onClick={onEditPlan}>
            Criar plano de treino
          </button>
        )}
      </EmptyState>
    );
  }

  const remaining = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Treino">
        {days.map((d) => {
          const isToday = d.dias_semana.includes(weekday);
          return (
            <button
              key={d.id}
              role="tab"
              aria-selected={d.id === dayId}
              onClick={() => setDayId(d.id)}
              className={`shrink-0 rounded-xl border px-3.5 py-2 text-left text-sm ${d.id === dayId ? "border-accent bg-accent text-on-accent" : "border-line bg-card"}`}
            >
              <span className="block font-semibold leading-tight">{d.nome}</span>
              <span className={`block text-[11px] ${d.id === dayId ? "opacity-90" : "text-muted"}`}>
                {isToday ? "Hoje" : d.dias_semana.length ? d.dias_semana.map((n) => WEEKDAYS[n]).join(" · ") : "Livre"}
              </span>
            </button>
          );
        })}
      </div>

      {day && (
        <div className="card flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">Progresso de hoje</div>
            <div className="tabular text-lg font-semibold">
              {doneSets} / {plannedSets || "–"} séries
            </div>
            {day.notas && <p className="mt-1 whitespace-pre-line text-xs text-muted">{day.notas}</p>}
          </div>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-card-2" aria-hidden="true">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${plannedSets ? Math.min(100, (doneSets / plannedSets) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {list.length === 0 && <p className="text-sm text-muted">Este treino ainda não tem exercícios.</p>}

      {list.map((x) => {
        const done = todayLogs.filter((l) => l.workout_exercise_id === x.id).sort((a, b) => a.serie - b.serie);
        const n = Math.max(x.series ?? 1, done.length ? Math.max(...done.map((d) => d.serie)) : 0) + (extra[x.id] ?? 0);
        const ls = last.get(x.id);
        const complete = x.series != null && done.length >= x.series;
        return (
          <section key={x.id} className={`card overflow-hidden ${complete ? "ring-1 ring-good/50" : ""}`}>
            <div className="flex items-center gap-3 p-3">
              <button onClick={() => x.exercise_id && setInfo(x)} disabled={!x.exercise_id} aria-label={`Ver ficha de ${x.nome}`}>
                <Thumb src={x.imagem} size={52} />
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-1.5 font-semibold leading-snug">
                  {x.nome}
                  {complete && <Icon name="check" size={16} className="text-good" />}
                </h3>
                <p className="tabular text-xs text-muted">{prescription(x)}</p>
                {ls && <p className="tabular text-[11px] text-muted">Última vez: {setsSummary(ls.sets)}</p>}
              </div>
              {x.exercise_id && (
                <button className="icon-btn" onClick={() => setInfo(x)} aria-label={`Como fazer ${x.nome}`}>
                  <Icon name="info" size={20} />
                </button>
              )}
            </div>
            {x.notas && <p className="whitespace-pre-line px-3 pb-2 text-xs italic text-muted">{x.notas}</p>}
            <ul className="divide-y divide-line border-t border-line">
              <li className="grid grid-cols-[3.5rem_1fr_1fr_3rem] items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                <span>Série</span>
                <span>Reps</span>
                <span>Kg</span>
                <span className="sr-only">Feito</span>
              </li>
              {Array.from({ length: n }, (_, i) => i + 1).map((serie) => {
                const log = done.find((d) => d.serie === serie);
                const d = draftFor(x, serie);
                const set = (patch: Partial<Draft>) => setDrafts((s) => ({ ...s, [`${x.id}-${serie}`]: { ...d, ...patch } }));
                return (
                  <li key={serie} className={`grid grid-cols-[3.5rem_1fr_1fr_3rem] items-center gap-2 px-3 py-1.5 ${log ? "bg-good/5" : ""}`}>
                    <span className="tabular text-sm font-medium">{serie}</span>
                    {log ? (
                      <>
                        <span className="tabular text-sm">{log.reps ?? "–"}</span>
                        <span className="tabular text-sm">{log.carga_kg ?? "–"}</span>
                      </>
                    ) : (
                      <>
                        <input
                          className="tabular w-full !min-h-10 !py-1"
                          inputMode="numeric"
                          aria-label={`Repetições da série ${serie} de ${x.nome}`}
                          value={d.reps}
                          onChange={(e) => set({ reps: e.target.value })}
                        />
                        <input
                          className="tabular w-full !min-h-10 !py-1"
                          inputMode="decimal"
                          aria-label={`Carga da série ${serie} de ${x.nome}`}
                          value={d.kg}
                          onChange={(e) => set({ kg: e.target.value })}
                        />
                      </>
                    )}
                    <button
                      className={`flex h-10 w-10 items-center justify-center rounded-lg border ${log ? "border-good bg-good text-white" : "border-line text-muted hover:border-accent hover:text-accent"}`}
                      onClick={() => (log ? undoSet(log) : logSet(x, serie))}
                      aria-label={log ? `Desmarcar série ${serie}` : `Marcar série ${serie} como feita`}
                      aria-pressed={!!log}
                    >
                      <Icon name="check" size={20} strokeWidth={log ? 2.4 : 1.75} />
                    </button>
                  </li>
                );
              })}
              <li>
                <button className="flex min-h-10 w-full items-center gap-2 px-3 text-xs font-medium text-accent" onClick={() => setExtra((s) => ({ ...s, [x.id]: (s[x.id] ?? 0) + 1 }))}>
                  <Icon name="plus" size={16} /> Série extra
                </button>
              </li>
            </ul>
          </section>
        );
      })}

      {rest && (
        <div
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-xl md:bottom-6"
          role="status"
          aria-live="polite"
        >
          <Icon name="clock" size={22} className="text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">Descanso</div>
            <div className="tabular text-xl font-bold">
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card-2">
              <div className="h-full bg-accent transition-all" style={{ width: `${(remaining / rest.total) * 100}%` }} />
            </div>
          </div>
          <button className="btn btn-ghost !min-h-10 !px-3" onClick={() => setRest({ ...rest, until: rest.until + 30_000, total: rest.total + 30 })}>
            +30 s
          </button>
          <button className="btn btn-primary !min-h-10 !px-3" onClick={() => setRest(null)}>
            Saltar
          </button>
        </div>
      )}

      <ResponsiveDialog open={!!info} wide title={info?.nome ?? ""} onClose={() => setInfo(null)}>
        {info?.exercise_id && <ExerciseDetail exerciseId={info.exercise_id} />}
      </ResponsiveDialog>
    </div>
  );
}
