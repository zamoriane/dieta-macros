"use client";
import Link from "next/link";
import { useState } from "react";
import type { Workout } from "@/lib/applehealth";
import { WorkoutDialog } from "./WorkoutDialog";
import type { HealthDayRow, OuraDay } from "@/lib/data";
import { SectionCard, SourceBadge } from "@/components/ui/Primitives";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n/client";

type Tile = { icon: IconName; label: string; value: string; detail?: string; source: "oura" | "apple" };

const fmtMin = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;

export function ActivityCard({ oura, health, source }: { oura: OuraDay | null; health: HealthDayRow | null; source: "oura" | "apple" }) {
  const { t, nf } = useI18n();
  const [open, setOpen] = useState<Workout | null>(null);
  const tiles: Tile[] = [];

  const active = source === "apple" ? health?.active_kcal : oura?.active_calories;
  if (active != null) tiles.push({ icon: "flame", label: t("ativ.atividade"), value: `${active}`, detail: t("ativ.kcalMedidas"), source });
  if (oura?.steps != null) tiles.push({ icon: "steps", label: t("ativ.passos"), value: nf(oura.steps), source });

  if (oura?.sleep_score != null) tiles.push({ icon: "moon", label: t("ativ.sono"), value: `${oura.sleep_score}`, detail: t("ativ.pontuacao"), source: "oura" });
  else if (health?.sleep_min) tiles.push({ icon: "moon", label: t("ativ.sono"), value: fmtMin(health.sleep_min), detail: t("ativ.dormido"), source: "apple" });

  if (oura?.readiness_score != null) tiles.push({ icon: "gauge", label: t("ativ.prontidao"), value: `${oura.readiness_score}`, detail: t("ativ.pontuacao"), source: "oura" });
  if (oura?.stress_high_min != null) tiles.push({ icon: "bolt", label: t("ativ.stressAlto"), value: `${oura.stress_high_min} min`, source: "oura" });

  const workouts = health?.workouts ?? [];

  if (!tiles.length && !workouts.length) {
    return (
      <SectionCard title={t("ativ.titulo")}>
        <p className="text-sm text-muted">
          {t("ativ.semDados")}{" "}
          <Link href="/perfil" className="font-medium text-accent">
            {t("ativ.verIntegracoes")}
          </Link>
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("ativ.titulo")}>
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {tiles.map((tl) => (
          <li key={tl.label} className="min-w-[8.5rem] snap-start rounded-xl bg-card-2 p-3 sm:min-w-0">
            <div className="flex items-center justify-between gap-1 text-muted">
              <Icon name={tl.icon} size={18} />
              <SourceBadge source={tl.source} />
            </div>
            <div className="tabular mt-2 text-lg font-semibold leading-tight">{tl.value}</div>
            <div className="text-xs text-muted">
              {tl.label}
              {tl.detail ? ` · ${tl.detail}` : ""}
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
                aria-label={t("ativ.verDetalhe", { nome: w.name })}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon name={w.route ? "steps" : "dumbbell"} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">{w.name}</span>
                  <span className="tabular block text-xs text-muted">
                    {[w.min != null && `${w.min} min`, w.km != null && /walk|run|hik|cycl|bik|caminh|corr|trilh|cicl|swim|nata|row|rem/i.test(w.name) && `${nf(w.km, 2)} km`, w.kcal != null && `${w.kcal} kcal`]
                      .filter(Boolean)
                      .join(" · ")}
                    {w.route ? ` · ${t("ativ.mapa")}` : ""}
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
