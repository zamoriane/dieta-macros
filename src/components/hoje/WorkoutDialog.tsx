"use client";
import type { Workout } from "@/lib/applehealth";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { WorkoutMap } from "@/components/WorkoutMap";
import { SourceBadge } from "@/components/ui/Primitives";
import { useI18n } from "@/lib/i18n/client";

const fmtTime = (s?: string) => (s ? s.slice(11, 16) : "");

function pace(min: number | null, km?: number | null) {
  if (!min || !km || km < 0.05) return null;
  const p = min / km;
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

/** Atividades onde distância e ritmo fazem sentido. */
const MOVING = /walk|run|hik|cycl|bik|caminh|corr|trilh|cicl|swim|nata|row|rem/i;

export function WorkoutDialog({ workout, onClose }: { workout: Workout | null; onClose: () => void }) {
  const { t, nf, df } = useI18n();
  const w = workout;
  const moving = !!w && MOVING.test(w.name);
  const stats = w
    ? [
        { k: t("treinoW.duracao"), v: w.min != null ? `${w.min} min` : "–" },
        ...(moving
          ? [
              { k: t("treinoW.distancia"), v: w.km != null ? `${nf(w.km, 2)} km` : "–" },
              { k: t("treinoW.ritmo"), v: pace(w.min, w.km) ?? "–" },
            ]
          : []),
        { k: t("treinoW.kcalAtivas"), v: w.kcal != null ? `${w.kcal} kcal` : "–" },
        { k: t("treinoW.fcMedia"), v: w.avg_hr != null ? `${w.avg_hr} bpm` : "–" },
        { k: t("treinoW.fcMax"), v: w.max_hr != null ? `${w.max_hr} bpm` : "–" },
      ]
    : [];

  return (
    <ResponsiveDialog open={!!w} title={w?.name ?? ""} onClose={onClose} wide>
      {w && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="first-letter:uppercase">{df(w.start.slice(0, 10), { weekday: "long", day: "numeric", month: "long" })}</span>
            <span>
              · {fmtTime(w.start)}
              {w.end ? `–${fmtTime(w.end)}` : ""}
            </span>
            <SourceBadge source="apple" />
          </p>

          {w.route && w.route.length > 1 ? (
            <WorkoutMap route={w.route} className="h-72 sm:h-96" />
          ) : (
            <p className="rounded-xl bg-card-2 p-4 text-center text-sm text-muted">{t("treinoW.semGps")}</p>
          )}

          <dl className="tabular grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.k} className="rounded-xl bg-card-2 p-3">
                <dt className="text-xs text-muted">{s.k}</dt>
                <dd className="mt-0.5 text-base font-semibold">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </ResponsiveDialog>
  );
}
