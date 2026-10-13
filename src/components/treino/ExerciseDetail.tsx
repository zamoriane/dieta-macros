"use client";
import { useEffect, useState } from "react";
import { getExercise, type Exercise } from "@/lib/workouts";
import { BODY_BACK, BODY_FRONT, exerciseUrl } from "@/lib/wger";
import { Skeleton } from "@/components/ui/Primitives";

/** Silhueta frente/costas da wger com os músculos trabalhados sobrepostos (principais a vermelho, secundários a laranja). */
export function MuscleMap({ exercise }: { exercise: Exercise }) {
  const ms = exercise.musculos ?? [];
  if (!ms.some((m) => m.img)) return null;
  const side = (front: boolean) => (
    <div className="relative w-full max-w-[130px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={front ? BODY_FRONT : BODY_BACK} alt="" className="block w-full" />
      {ms
        .filter((m) => m.frente === front && m.img)
        .map((m) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${m.id}-${m.sec}`} src={m.img!} alt="" className="absolute inset-0 h-full w-full" />
        ))}
    </div>
  );
  return (
    <figure className="space-y-2">
      <div className="flex justify-center gap-4 rounded-xl bg-white p-3">
        {side(true)}
        {side(false)}
      </div>
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {ms.filter((m) => !m.sec).length > 0 && (
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#d33]" aria-hidden="true" />
            Principais: {ms.filter((m) => !m.sec).map((m) => m.nome).join(", ")}
          </span>
        )}
        {ms.some((m) => m.sec) && (
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#f59e0b]" aria-hidden="true" />
            Secundários: {ms.filter((m) => m.sec).map((m) => m.nome).join(", ")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Ficha do exercício: imagem, músculos, equipamento, instruções e atribuição (CC BY-SA). */
export function ExerciseDetail({ exerciseId, initial }: { exerciseId: number; initial?: Exercise | null }) {
  const [ex, setEx] = useState<Exercise | null>(initial && initial.descricao !== undefined ? initial : null);
  const [loading, setLoading] = useState(!ex);

  useEffect(() => {
    if (ex?.id === exerciseId && ex.descricao !== undefined) return;
    let alive = true;
    setLoading(true);
    getExercise(exerciseId).then((e) => {
      if (!alive) return;
      setEx(e);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [exerciseId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !initial) return <Skeleton className="h-64" />;
  const e = ex ?? initial;
  if (!e) return <p className="text-sm text-muted">Exercício não encontrado.</p>;

  return (
    <div className="space-y-4">
      {e.imagem && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.imagem} alt={e.nome} className="mx-auto max-h-64 w-auto rounded-xl bg-white object-contain" loading="lazy" />
      )}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {e.categoria && <span className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">{e.categoria}</span>}
        {e.equipamento.map((q) => (
          <span key={q} className="rounded-full bg-card-2 px-2.5 py-1 text-muted">
            {q}
          </span>
        ))}
      </div>
      {e.nome_pt && e.nome_en && <p className="text-xs text-muted">Em inglês: {e.nome_en}</p>}
      <MuscleMap exercise={e} />
      {loading ? (
        <Skeleton className="h-20" />
      ) : e.descricao ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Como fazer{!e.nome_pt ? " (em inglês)" : ""}</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed">{e.descricao}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">Sem instruções na base de dados para este exercício.</p>
      )}
      <p className="border-t border-line pt-3 text-[11px] leading-snug text-muted">
        Exercício da{" "}
        <a href={exerciseUrl(e.id)} target="_blank" rel="noopener noreferrer" className="underline">
          wger.de
        </a>
        {e.autor ? ` · autoria: ${e.autor}` : ""} ·{" "}
        <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.pt" target="_blank" rel="noopener noreferrer" className="underline">
          {e.licenca ?? "CC-BY-SA 3"}
        </a>
        . Nomes de músculos e equipamento traduzidos.
      </p>
    </div>
  );
}
