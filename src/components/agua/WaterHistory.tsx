"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, isoDay } from "@/lib/data";
import { getWaterLogs, totalsByDay } from "@/lib/waterData";
import { SectionCard, Skeleton } from "@/components/ui/Primitives";
import { useI18n } from "@/lib/i18n/client";

/** Barras dos últimos 7 ou 30 dias (mL que contam como água) com a linha da meta. */
export function WaterHistory({ owner, goalMl, refreshKey = 0, title }: { owner: string; goalMl: number | null; refreshKey?: number; title?: string }) {
  const { t, nf, df } = useI18n();
  const sb = useMemo(() => createClient(), []);
  const [range, setRange] = useState<7 | 30>(7);
  const [byDay, setByDay] = useState<Map<string, number> | null>(null);
  const today = isoDay();

  useEffect(() => {
    let alive = true;
    getWaterLogs(sb, owner, addDays(today, -(range - 1)), today)
      .then((logs) => alive && setByDay(totalsByDay(logs)))
      .catch(() => alive && setByDay(new Map()));
    return () => {
      alive = false;
    };
  }, [sb, owner, range, today, refreshKey]);

  const days = Array.from({ length: range }, (_, i) => addDays(today, i - (range - 1)));
  const values = days.map((d) => byDay?.get(d) ?? 0);
  const logged = values.filter((v) => v > 0);
  const max = Math.max(goalMl ?? 0, ...values, 1);
  const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;
  const hit = goalMl ? values.filter((v) => v >= goalMl).length : 0;
  const L = (ml: number) => nf(Math.round(ml / 100) / 10);

  return (
    <SectionCard
      title={title ?? t("agua.historico")}
      action={
        <div className="flex rounded-lg bg-card-2 p-0.5 text-xs" role="tablist">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={`min-h-8 rounded-md px-3 font-medium ${range === r ? "bg-card text-ink shadow-sm" : "text-muted"}`}
            >
              {t("agua.dias", { n: r })}
            </button>
          ))}
        </div>
      }
    >
      {byDay === null ? (
        <Skeleton className="h-32" />
      ) : logged.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t("agua.semHistorico")}</p>
      ) : (
        <>
          <div className="relative flex h-32 items-end gap-[3px]" role="img" aria-label={t("agua.media", { l: L(avg) })}>
            {goalMl ? <div className="absolute inset-x-0 border-t border-dashed border-ink/40" style={{ bottom: `${(goalMl / max) * 100}%` }} /> : null}
            {days.map((d, i) => (
              <div key={d} className="flex h-full min-w-0 flex-1 items-end" title={`${df(d, { day: "numeric", month: "short" })}: ${L(values[i])} L`}>
                <div
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${(values[i] / max) * 100}%`,
                    minHeight: values[i] > 0 ? 2 : 0,
                    background: goalMl && values[i] >= goalMl ? "var(--good)" : "var(--prot)",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{df(days[0], { day: "numeric", month: "short" })}</span>
            <span>{t("comum.hoje")}</span>
          </div>
          <p className="tabular mt-3 text-sm">
            {t("agua.media", { l: L(avg) })}
            {goalMl ? <span className="text-muted"> · {t("agua.diasMeta", { n: hit, total: range })}</span> : null}
          </p>
        </>
      )}
    </SectionCard>
  );
}
