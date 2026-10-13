"use client";
import Link from "next/link";
import { useState } from "react";
import type { Workout } from "@/lib/applehealth";
import { WorkoutDialog } from "./WorkoutDialog";
import type { HealthDayRow, OuraDay } from "@/lib/data";
import { SectionCard, SourceBadge } from "@/components/ui/Primitives";
import { Icon, type IconName } from "@/components/ui/Icon";

type Tile = { icon: IconName; label: string; value: string; detail?: string; source: "oura" | "apple" };

const fmtMin = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;

export function ActivityCard({ oura, health, source }: { oura: OuraDay | null; health: HealthDayRow | null; source: "oura" | "apple" }) {
  const [open, setOpen] = useState<Workout | null>(null);
  const tiles: Tile[] = [];

  const active = source === "apple" ? health?.active_kcal : oura?.active_calories;
  if (active != null) tiles.push({ icon: "flame", label: "Atividade", value: `${active}`, detail: "kcal medidas", source });
  if (oura?.steps != null) tiles.push({ icon: "steps", label: "Passos", value: oura.steps.toLocaleString("pt-PT"), source });

  if (oura?.sleep_score != null) tiles.push({ icon: "moon", label: "Sono", value: `${oura.sleep_score}`, detail: "pontuação", source: "oura" });
  else if (health?.sleep_min) tiles.push({ icon: "moon", label: "Sono", value: fmtMin(health.sleep_min), detail: "dormido", source: "apple" });

  if (oura?.readiness_score != null) tiles.push({ icon: "gauge", label: "Prontidão", value: `${oura.readiness_score}`, detail: "pontuação", source: "oura" });
  if (oura?.stress_high_min != null) tiles.push({ icon: "bolt", label: "Stress alto", value: `${oura.stress_high_min} min`, source: "oura" });

  const workouts = health?.workouts ?? [];

  if (!tiles.length && !workouts.length) {
    return (
      <SectionCard title="Atividade e recuperação">
        <p className="text-sm text-muted">
          Ainda não há dados sincronizados para este dia.{" "}
          <Link href="/perfil" className="font-medium text-accent">
            Ver integrações
          </Link>
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Atividade e recuperação">
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {tiles.map((t) => (
          <li key={t.label} className="min-w-[8.5rem] snap-start rounded-xl bg-card-2 p-3 sm:min-w-0">
            <div className="flex items-center justify-between gap-1 text-muted">
              <Icon name={t.icon} size={18} />
              <SourceBadge source={t.source} />
            </div>
            <div className="tabular mt-2 text-lg font-semibold leading-tight">{t.value}</div>
            <div className="text-xs text-muted">
              {t.label}
              {t.detail ? ` · ${t.detail}` : ""}
            </div>
          </li>
        ))}
      </ul>

      {workouts.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2">
          {workouts.map((w, i) => (
            <li key={w.id ?? i}>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left text-sm hover:bg-card-2"
                onClick={() => setOpen(w)}
                aria-label={`Ver detalhe de ${w.name}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon name={w.route ? "steps" : "dumbbell"} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">{w.name}</span>
                  <span className="tabular block text-xs text-muted">
                    {[w.min != null && `${w.min} min`, w.km != null && /walk|run|hik|cycl|bik|caminh|corr|trilh|cicl|swim|nata|row|rem/i.test(w.name) && `${w.km.toLocaleString("pt-PT")} km`, w.kcal != null && `${w.kcal} kcal`]
                      .filter(Boolean)
                      .join(" · ")}
                    {w.route ? " · mapa" : ""}
                  </span>
                </span>
                <SourceBadge source="apple" />
                <Icon name="chevronRight" size={16} className="shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <WorkoutDialog workout={open} onClose={() => setOpen(null)} />
    </SectionCard>
  );
}
