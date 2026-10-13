"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, isoDay } from "@/lib/data";
import { getLogs, getWorkout, lastSessions, setsSummary, type Params, type WorkoutDay, type WorkoutExercise, type WorkoutLog } from "@/lib/workouts";
import { prescription, WEEKDAYS } from "@/lib/wger";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { EmptyState, FormField, SectionCard, Skeleton } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { ExercisePicker, ParamsFields, paramsError, Thumb } from "./ExercisePicker";
import { ExerciseDetail } from "./ExerciseDetail";

type Change = { id: number; actor_id: string | null; acao: string; resumo: string; em: string };
type DayForm = { mode: "new" | "edit"; day?: WorkoutDay; nome: string; dias: number[]; notas: string };

/**
 * Editor do plano de treino. Serve o próprio utilizador (/treino) e o treinador
 * a editar o plano de um cliente (/clientes/[id]); `ownerId` é sempre o dono do plano.
 */
export function WorkoutEditor({ ownerId, viewerId, names = {} }: { ownerId: string; viewerId: string; names?: Record<string, string> }) {
  const sb = useMemo(() => createClient(), []);
  const [days, setDays] = useState<WorkoutDay[]>([]);
  const [exs, setExs] = useState<WorkoutExercise[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [dayForm, setDayForm] = useState<DayForm | null>(null);
  const [deleteDay, setDeleteDay] = useState<WorkoutDay | null>(null);
  const [picker, setPicker] = useState<WorkoutDay | null>(null);
  const [edit, setEdit] = useState<{ ex: WorkoutExercise; p: Params } | null>(null);
  const [info, setInfo] = useState<WorkoutExercise | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, l, { data: ch }] = await Promise.all([
        getWorkout(sb, ownerId),
        getLogs(sb, ownerId, addDays(isoDay(), -60)),
        sb.from("workout_changes").select("id, actor_id, acao, resumo, em").eq("owner_id", ownerId).order("em", { ascending: false }).order("id", { ascending: false }).limit(30),
      ]);
      setDays(w.days);
      setExs(w.exercises);
      setLogs(l);
      setChanges((ch ?? []) as Change[]);
    } catch (e) {
      toast(`Não foi possível carregar o treino: ${(e as Error).message}`, { kind: "erro" });
    }
    setLoaded(true);
  }, [sb, ownerId]);

  useEffect(() => {
    load();
  }, [load]);

  const last = useMemo(() => lastSessions(logs), [logs]);
  const who = (id: string | null) => (!id ? "sistema" : id === viewerId ? "você" : names[id] ?? "outra pessoa");

  async function saveDay() {
    if (!dayForm || !dayForm.nome.trim()) return;
    const row = { nome: dayForm.nome.trim(), dias_semana: [...dayForm.dias].sort(), notas: dayForm.notas.trim() || null };
    const { error } =
      dayForm.mode === "new"
        ? await sb.from("workout_days").insert({ ...row, user_id: ownerId, posicao: days.length })
        : await sb.from("workout_days").update(row).eq("id", dayForm.day!.id);
    if (error) return toast(error.message, { kind: "erro" });
    setDayForm(null);
    await load();
    toast(dayForm.mode === "new" ? "Treino criado" : "Treino atualizado");
  }

  async function confirmDeleteDay() {
    if (!deleteDay) return;
    const { error } = await sb.from("workout_days").delete().eq("id", deleteDay.id);
    if (error) return toast(error.message, { kind: "erro" });
    setDeleteDay(null);
    await load();
    toast(`"${deleteDay.nome}" apagado`);
  }

  async function moveDay(d: WorkoutDay, dir: -1 | 1) {
    const i = days.findIndex((x) => x.id === d.id);
    const o = days[i + dir];
    if (!o) return;
    await Promise.all([
      sb.from("workout_days").update({ posicao: i + dir }).eq("id", d.id),
      sb.from("workout_days").update({ posicao: i }).eq("id", o.id),
    ]);
    load();
  }

  async function moveEx(x: WorkoutExercise, dir: -1 | 1) {
    const list = exs.filter((e) => e.workout_day_id === x.workout_day_id);
    const i = list.findIndex((e) => e.id === x.id);
    const o = list[i + dir];
    if (!o) return;
    await Promise.all([
      sb.from("workout_exercises").update({ posicao: i + dir }).eq("id", x.id),
      sb.from("workout_exercises").update({ posicao: i }).eq("id", o.id),
    ]);
    load();
  }

  async function saveEdit() {
    if (!edit || paramsError(edit.p)) return;
    const { error } = await sb.from("workout_exercises").update(edit.p).eq("id", edit.ex.id);
    if (error) return toast(error.message, { kind: "erro" });
    setEdit(null);
    await load();
    toast("Exercício atualizado");
  }

  async function removeEx(x: WorkoutExercise) {
    const { error } = await sb.from("workout_exercises").delete().eq("id", x.id);
    if (error) return toast(error.message, { kind: "erro" });
    await load();
    toast(`${x.nome} removido`, {
      action: {
        label: "Desfazer",
        run: async () => {
          const { id: _id, ...rest } = x;
          await sb.from("workout_exercises").insert({ ...rest, user_id: ownerId });
          load();
        },
      },
    });
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Treinos</h2>
          <button className="btn btn-ghost !min-h-10 !px-3" onClick={() => setDayForm({ mode: "new", nome: `Treino ${String.fromCharCode(65 + days.length)}`, dias: [], notas: "" })}>
            <Icon name="plus" size={18} /> Treino
          </button>
        </div>

        {!loaded && [0, 1].map((i) => <Skeleton key={i} className="h-32" />)}

        {loaded && days.length === 0 && (
          <EmptyState icon="dumbbell" title="Sem plano de treino">
            Crie um treino (ex.: Treino A — peito e tríceps), escolha os dias da semana e adicione exercícios.
            <button className="btn btn-primary mt-3" onClick={() => setDayForm({ mode: "new", nome: "Treino A", dias: [], notas: "" })}>
              <Icon name="plus" size={18} /> Criar primeiro treino
            </button>
          </EmptyState>
        )}

        {days.map((d, i) => {
          const list = exs.filter((e) => e.workout_day_id === d.id);
          return (
            <section key={d.id} className="card overflow-hidden">
              <div className="flex items-center gap-1 py-2 pl-4 pr-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold leading-snug">{d.nome}</h3>
                  <p className="text-xs text-muted">
                    {d.dias_semana.length ? d.dias_semana.map((n) => WEEKDAYS[n]).join(" · ") : "Sem dia fixo"} · {list.length} exercício{list.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button className="icon-btn" disabled={i === 0} style={i === 0 ? { opacity: 0.3 } : undefined} onClick={() => moveDay(d, -1)} aria-label={`Subir ${d.nome}`}>
                  <Icon name="chevronDown" size={18} className="rotate-180" />
                </button>
                <button
                  className="icon-btn"
                  disabled={i === days.length - 1}
                  style={i === days.length - 1 ? { opacity: 0.3 } : undefined}
                  onClick={() => moveDay(d, 1)}
                  aria-label={`Descer ${d.nome}`}
                >
                  <Icon name="chevronDown" size={18} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => setDayForm({ mode: "edit", day: d, nome: d.nome, dias: d.dias_semana, notas: d.notas ?? "" })}
                  aria-label={`Editar ${d.nome}`}
                >
                  <Icon name="edit" size={18} />
                </button>
                <button className="icon-btn hover:!text-bad" onClick={() => setDeleteDay(d)} aria-label={`Apagar ${d.nome}`}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
              {d.notas && <p className="whitespace-pre-line border-t border-line px-4 py-2 text-xs text-muted">{d.notas}</p>}
              <ul className="divide-y divide-line border-t border-line">
                {list.map((x, j) => {
                  const ls = last.get(x.id);
                  return (
                    <li key={x.id} className="flex items-center gap-2 py-2 pl-3 pr-1">
                      <button className="shrink-0" onClick={() => x.exercise_id && setInfo(x)} aria-label={`Ver ficha de ${x.nome}`} disabled={!x.exercise_id}>
                        <Thumb src={x.imagem} size={44} />
                      </button>
                      <button
                        className="min-w-0 flex-1 py-1 text-left"
                        onClick={() => setEdit({ ex: x, p: { series: x.series, reps: x.reps, carga_kg: x.carga_kg, descanso_s: x.descanso_s, notas: x.notas } })}
                        aria-label={`Editar ${x.nome}`}
                      >
                        <span className="block text-sm font-medium leading-snug">{x.nome}</span>
                        <span className="tabular block text-xs text-muted">{prescription(x) || "Sem prescrição"}</span>
                        {ls && (
                          <span className="tabular block text-[11px] text-muted">
                            Última vez ({new Date(ls.dia + "T12:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}): {setsSummary(ls.sets)}
                          </span>
                        )}
                        {x.notas && <span className="block truncate text-[11px] italic text-muted">{x.notas}</span>}
                      </button>
                      <div className="flex shrink-0 flex-col">
                        <button className="icon-btn !h-8 !min-h-0" disabled={j === 0} style={j === 0 ? { opacity: 0.3 } : undefined} onClick={() => moveEx(x, -1)} aria-label={`Subir ${x.nome}`}>
                          <Icon name="chevronDown" size={16} className="rotate-180" />
                        </button>
                        <button
                          className="icon-btn !h-8 !min-h-0"
                          disabled={j === list.length - 1}
                          style={j === list.length - 1 ? { opacity: 0.3 } : undefined}
                          onClick={() => moveEx(x, 1)}
                          aria-label={`Descer ${x.nome}`}
                        >
                          <Icon name="chevronDown" size={16} />
                        </button>
                      </div>
                      <button className="icon-btn shrink-0 hover:!text-bad" onClick={() => removeEx(x)} aria-label={`Remover ${x.nome}`}>
                        <Icon name="trash" size={18} />
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button className="flex min-h-12 w-full items-center gap-2 px-4 text-sm font-medium text-accent hover:bg-card-2/60" onClick={() => setPicker(d)}>
                    <Icon name="plus" size={18} /> Adicionar exercício
                  </button>
                </li>
              </ul>
            </section>
          );
        })}
      </div>

      <div className="min-w-0 space-y-5 lg:sticky lg:top-24">
        <SectionCard title="Histórico de alterações">
          {changes.length ? (
            <ul className="space-y-2.5 text-sm">
              {changes.slice(0, 12).map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.acao === "removeu" ? "bg-bad" : c.acao === "criou" ? "bg-good" : "bg-warn"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      <span className="capitalize">{c.acao}</span> {c.resumo}
                    </span>
                    <span className="text-xs text-muted">
                      por {who(c.actor_id)} · {new Date(c.em).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">As alterações ao plano de treino ficam registadas aqui, com quem as fez.</p>
          )}
        </SectionCard>
      </div>

      {picker && (
        <ExercisePicker
          title={`Adicionar a ${picker.nome}`}
          onClose={() => setPicker(null)}
          onPick={async (ex, p) => {
            const { error } = await sb.from("workout_exercises").insert({
              user_id: ownerId,
              workout_day_id: picker.id,
              exercise_id: ex.id,
              nome: ex.nome,
              imagem: ex.imagem_thumb,
              ...p,
              posicao: exs.filter((e) => e.workout_day_id === picker.id).length,
            });
            if (error) return void toast(error.message, { kind: "erro" });
            await load();
            toast(`${ex.nome} adicionado a ${picker.nome}`);
          }}
        />
      )}

      <ResponsiveDialog
        open={!!edit}
        title={edit?.ex.nome ?? ""}
        onClose={() => setEdit(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setEdit(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary flex-1" disabled={!edit || !!paramsError(edit.p)} onClick={saveEdit}>
              Guardar
            </button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <ParamsFields value={edit.p} onChange={(p) => setEdit({ ...edit, p })} />
            {paramsError(edit.p) && <p className="text-xs text-bad">{paramsError(edit.p)}</p>}
          </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog open={!!info} wide title={info?.nome ?? ""} onClose={() => setInfo(null)}>
        {info?.exercise_id && <ExerciseDetail exerciseId={info.exercise_id} />}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!dayForm}
        title={dayForm?.mode === "edit" ? "Editar treino" : "Novo treino"}
        onClose={() => setDayForm(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setDayForm(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary flex-1" disabled={!dayForm?.nome.trim()} onClick={saveDay}>
              Guardar
            </button>
          </>
        }
      >
        {dayForm && (
          <div className="space-y-4">
            <FormField label="Nome" hint="Ex.: Treino A — Peito e tríceps">
              <input data-autofocus className="w-full" value={dayForm.nome} maxLength={60} onChange={(e) => setDayForm({ ...dayForm, nome: e.target.value })} />
            </FormField>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Dias da semana</legend>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w, n) => {
                  const on = dayForm.dias.includes(n);
                  return (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDayForm({ ...dayForm, dias: on ? dayForm.dias.filter((x) => x !== n) : [...dayForm.dias, n] })}
                      className={`min-h-10 rounded-lg border text-xs font-medium ${on ? "border-accent bg-accent text-on-accent" : "border-line text-muted"}`}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted">Usado para sugerir o treino do dia. Pode deixar vazio.</p>
            </fieldset>
            <FormField label="Notas" hint="Aquecimento, objetivo do treino…">
              <textarea className="w-full" rows={2} maxLength={500} value={dayForm.notas} onChange={(e) => setDayForm({ ...dayForm, notas: e.target.value })} />
            </FormField>
          </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!deleteDay}
        title="Apagar treino"
        onClose={() => setDeleteDay(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setDeleteDay(null)}>
              Cancelar
            </button>
            <button className="btn flex-1 bg-bad text-white" onClick={confirmDeleteDay}>
              Apagar
            </button>
          </>
        }
      >
        <p className="text-sm">
          Apagar <strong>{deleteDay?.nome}</strong> e os exercícios dele? As séries já registadas mantêm-se no histórico.
        </p>
      </ResponsiveDialog>
    </div>
  );
}
