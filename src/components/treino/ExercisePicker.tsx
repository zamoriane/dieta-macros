"use client";
import { useEffect, useState } from "react";
import { searchExercises, type Exercise, type Params } from "@/lib/workouts";
import { CATEGORIES } from "@/lib/wger";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { FormField, Skeleton } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { ExerciseDetail } from "./ExerciseDetail";

export const DEFAULT_PARAMS: Params = { series: 3, reps: "10-12", carga_kg: null, descanso_s: 90, notas: null };

const CATS = Object.values(CATEGORIES);

/** Campos de prescrição (séries, repetições, carga, descanso, notas). */
export function ParamsFields({ value, onChange }: { value: Params; onChange: (p: Params) => void }) {
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Séries">
        <input
          className="w-full"
          inputMode="numeric"
          value={value.series ?? ""}
          onChange={(e) => onChange({ ...value, series: num(e.target.value) })}
        />
      </FormField>
      <FormField label="Repetições" hint="Ex.: 8-12, 15, 30 s">
        <input className="w-full" value={value.reps ?? ""} maxLength={20} onChange={(e) => onChange({ ...value, reps: e.target.value || null })} />
      </FormField>
      <FormField label="Carga (kg)" hint="Opcional">
        <input
          className="w-full"
          inputMode="decimal"
          value={value.carga_kg ?? ""}
          onChange={(e) => onChange({ ...value, carga_kg: num(e.target.value) })}
        />
      </FormField>
      <FormField label="Descanso (s)">
        <input
          className="w-full"
          inputMode="numeric"
          value={value.descanso_s ?? ""}
          onChange={(e) => onChange({ ...value, descanso_s: num(e.target.value) })}
        />
      </FormField>
      <div className="col-span-2">
        <FormField label="Notas" hint="Técnica, cadência, variações…">
          <textarea className="w-full" rows={2} maxLength={500} value={value.notas ?? ""} onChange={(e) => onChange({ ...value, notas: e.target.value || null })} />
        </FormField>
      </div>
    </div>
  );
}

export function paramsError(p: Params): string | null {
  if (p.series != null && (!Number.isInteger(p.series) || p.series < 1 || p.series > 20)) return "Séries: entre 1 e 20.";
  if (p.carga_kg != null && (!Number.isFinite(p.carga_kg) || p.carga_kg < 0 || p.carga_kg > 9999)) return "Carga inválida.";
  if (p.descanso_s != null && (!Number.isInteger(p.descanso_s) || p.descanso_s < 0 || p.descanso_s > 900)) return "Descanso: 0 a 900 s.";
  return null;
}

/** Procurar um exercício na wger, ver a ficha e definir a prescrição antes de adicionar. */
export function ExercisePicker({
  title,
  onClose,
  onPick,
}: {
  title: string;
  onClose: () => void;
  onPick: (ex: Exercise | { id: null; nome: string; imagem_thumb: null }, p: Params) => Promise<void> | void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [results, setResults] = useState<Exercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Exercise | { id: null; nome: string; imagem_thumb: null } | null>(null);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setResults(null);
      const r = await searchExercises(q.trim(), cat);
      if (!alive) return;
      setResults(r.exercises ?? []);
      setError(r.error ?? null);
    }, q ? 300 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, cat]);

  const err = paramsError(params);

  async function add() {
    if (!sel || err) return;
    setBusy(true);
    await onPick(sel, params);
    setBusy(false);
    setSel(null);
    setParams(DEFAULT_PARAMS);
  }

  return (
    <ResponsiveDialog
      open
      wide
      title={sel ? sel.nome : title}
      onClose={sel ? () => setSel(null) : onClose}
      footer={
        sel ? (
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setSel(null)}>
              <Icon name="chevronLeft" size={18} /> Voltar
            </button>
            <button className="btn btn-primary flex-1" disabled={!!err || busy} onClick={add}>
              {busy ? "A adicionar…" : "Adicionar ao treino"}
            </button>
          </>
        ) : undefined
      }
    >
      {sel ? (
        <div className="space-y-5">
          <ParamsFields value={params} onChange={setParams} />
          {err && <p className="text-xs text-bad">{err}</p>}
          {sel.id != null && <ExerciseDetail exerciseId={sel.id} initial={sel} />}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">Procurar exercício</span>
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              data-autofocus
              className="w-full !pl-10"
              placeholder="Ex.: supino, agachamento, remada, prancha"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Grupo muscular">
            {[null, ...CATS].map((c) => (
              <button
                key={c ?? "todos"}
                onClick={() => setCat(c)}
                aria-pressed={cat === c}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  cat === c ? "border-accent bg-accent text-on-accent" : "border-line text-muted hover:text-ink"
                }`}
              >
                {c ?? "Todos"}
              </button>
            ))}
          </div>

          {error && <p className="rounded-lg bg-bad/10 p-3 text-sm text-bad">{error}</p>}
          {results === null && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
              {!q && !cat && <p className="text-xs text-muted">Na primeira utilização o catálogo da wger é carregado (alguns segundos).</p>}
            </div>
          )}
          {results && results.length === 0 && !error && <p className="py-4 text-center text-sm text-muted">Nenhum exercício encontrado.</p>}
          {results && (
            <ul className="divide-y divide-line">
              {results.map((x) => (
                <li key={x.id}>
                  <button className="flex w-full items-center gap-3 py-2 text-left hover:bg-card-2/60" onClick={() => setSel(x)}>
                    <Thumb src={x.imagem_thumb} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug">{x.nome}</span>
                      <span className="block truncate text-xs text-muted">
                        {[x.categoria, x.musculos.filter((m) => !m.sec).map((m) => m.nome).join(", "), x.equipamento.join(", ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={18} className="shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && (
            <button
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-sm font-medium text-accent"
              onClick={() => setSel({ id: null, nome: q.trim(), imagem_thumb: null })}
            >
              <Icon name="plus" size={18} /> Usar “{q.trim()}” como exercício livre
            </button>
          )}
          <p className="text-[11px] text-muted">Exercícios da base aberta wger.de (CC BY-SA). A maioria tem nome em inglês; pode pesquisar em português.</p>
        </div>
      )}
    </ResponsiveDialog>
  );
}

export function Thumb({ src, size = 48 }: { src: string | null | undefined; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-lg bg-white object-contain" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-lg bg-card-2 text-muted" style={{ width: size, height: size }}>
      <Icon name="dumbbell" size={size * 0.45} />
    </span>
  );
}
