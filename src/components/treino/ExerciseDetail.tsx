"use client";
import { useEffect, useState } from "react";
import { getExercise, type Exercise } from "@/lib/workouts";
import { BODY_BACK, BODY_FRONT, catLabel, equipLabel, exName, exerciseUrl, muscleLabel } from "@/lib/wger";
import { useI18n } from "@/lib/i18n/client";
import { Skeleton } from "@/components/ui/Primitives";

/** Silhueta frente/costas da wger com os músculos trabalhados sobrepostos (principais a vermelho, secundários a laranja). */
export function MuscleMap({ exercise }: { exercise: Exercise }) {
  const { t, locale } = useI18n();
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
            {t("ex.principais")}: {ms.filter((m) => !m.sec).map((m) => muscleLabel(m, locale)).join(", ")}
          </span>
        )}
        {ms.some((m) => m.sec) && (
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#f59e0b]" aria-hidden="true" />
            {t("ex.secundarios")}: {ms.filter((m) => m.sec).map((m) => muscleLabel(m, locale)).join(", ")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Ficha do exercício: imagem, músculos, equipamento, instruções e atribuição (CC BY-SA). */
export function ExerciseDetail({ exerciseId, initial }: { exerciseId: number; initial?: Exercise | null }) {
  const { t, locale } = useI18n();
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
  if (!e) return <p className="text-sm text-muted">{t("ex.naoEncontrado")}</p>;

  return (
    <div className="space-y-4">
      {e.imagem && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.imagem} alt={exName(e, locale)} className="mx-auto max-h-64 w-auto rounded-xl bg-white object-contain" loading="lazy" />
      )}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {e.categoria && <span className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">{catLabel(e.categoria, locale)}</span>}
        {e.equipamento.map((q) => (
          <span key={q} className="rounded-full bg-card-2 px-2.5 py-1 text-muted">
            {equipLabel(q, locale)}
          </span>
        ))}
      </div>
      {locale === "pt" && e.nome_pt && e.nome_en && <p className="text-xs text-muted">{t("ex.emIngles", { nome: e.nome_en })}</p>}
      <MuscleMap exercise={e} />
      {loading ? (
        <Skeleton className="h-20" />
      ) : e.descricao ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t("ex.comoFazer")}{locale === "pt" && !e.nome_pt ? t("ex.emInglesSufixo") : locale === "en" && e.nome_pt ? t("ex.emPortuguesSufixo") : ""}</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed">{e.descricao}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">{t("ex.semInstrucoes")}</p>
      )}
      <p className="border-t border-line pt-3 text-[11px] leading-snug text-muted">
        {t("ex.daWger")}{" "}
        <a href={exerciseUrl(e.id)} target="_blank" rel="noopener noreferrer" className="underline">
          wger.de
        </a>
        {e.autor ? ` · ${t("ex.autoria", { autor: e.autor })}` : ""} ·{" "}
        <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.pt" target="_blank" rel="noopener noreferrer" className="underline">
          {e.licenca ?? "CC-BY-SA 3"}
        </a>
        {locale === "pt" ? t("ex.traduzidos") : "."}
      </p>
    </div>
  );
}
