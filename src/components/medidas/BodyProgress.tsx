"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lastValue, navyBodyFat, waistToHeight, whtrLevel, type Measurement, type Sex } from "@/lib/body";
import { getMeasurements } from "@/lib/measurements";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { StatusBadge } from "@/components/ui/Primitives";
import { useWidth } from "@/components/resumo/useWidth";
import { LEVEL_TONE } from "./MeasurementsCard";

const H = 170;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

/** Evolução das medidas (Resumo e área do treinador): cintura e anca, cintura/altura e % de gordura. */
export function BodyProgress({ owner, sex, heightCm }: { owner: string; sex: Sex | null; heightCm: number | null }) {
  const { t, df, nf } = useI18n();
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Measurement[] | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();

  useEffect(() => {
    getMeasurements(sb, owner)
      .then(setRows)
      .catch(() => setRows([]));
  }, [sb, owner]);

  const waistPts = (rows ?? []).filter((r) => r.cintura != null).map((r) => ({ dia: r.dia, v: Number(r.cintura) }));
  const hipPts = (rows ?? []).filter((r) => r.anca != null).map((r) => ({ dia: r.dia, v: Number(r.anca) }));
  const bfAt = (dia: string) => {
    const w = lastValue(rows ?? [], "cintura", dia)?.v;
    const n = lastValue(rows ?? [], "pescoco", dia)?.v;
    const h = lastValue(rows ?? [], "anca", dia)?.v;
    return sex && heightCm && w && n ? navyBodyFat(sex, heightCm, w, n, h) : null;
  };

  return (
    <section className="card space-y-3 p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{t("med.evolucao")}</h2>
      {rows === null ? (
        <div className="skeleton h-40" />
      ) : !waistPts.length ? (
        <p className="py-6 text-center text-sm text-muted">{t("med.semDados")}</p>
      ) : (
        (() => {
          const first = waistPts[0];
          const last = waistPts[waistPts.length - 1];
          const delta = Math.round((last.v - first.v) * 10) / 10;
          const whtr = heightCm ? waistToHeight(last.v, heightCm) : null;
          const bfNow = bfAt(last.dia);
          const bfFirst = bfAt(first.dia);
          // eixo
          const all = [...waistPts, ...hipPts].map((p) => p.v);
          const lo = Math.floor(Math.min(...all) - 2);
          const hi = Math.ceil(Math.max(...all) + 2);
          const t0 = new Date(waistPts[0].dia).getTime();
          const t1 = Math.max(new Date(last.dia).getTime(), ...hipPts.map((p) => new Date(p.dia).getTime()));
          const x = (d: string) => PAD.left + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (width - PAD.left - PAD.right);
          const y = (v: number) => PAD.top + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD.top - PAD.bottom);
          const path = (pts: { dia: string; v: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.dia)},${y(p.v)}`).join(" ");
          const ticks = [lo, Math.round((lo + hi) / 2), hi];
          return (
            <>
              <dl className="tabular grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Kpi k={t("med.cintura")} v={`${nf(last.v)} cm`} sub={waistPts.length > 1 ? t("med.desde", { d: `${delta > 0 ? "+" : ""}${nf(delta)} cm`, data: df(first.dia, { day: "numeric", month: "short" }) }) : df(last.dia, { day: "numeric", month: "short" })} />
                <Kpi
                  k={t("med.whtr")}
                  v={whtr != null ? nf(whtr, 2) : "–"}
                  sub={whtr != null ? <StatusBadge tone={LEVEL_TONE[whtrLevel(whtr)]}>{t(`med.nivel.${whtrLevel(whtr)}` as MessageKey)}</StatusBadge> : t("med.precisaAltura")}
                />
                <Kpi
                  k={t("med.gordura")}
                  v={bfNow != null ? `≈ ${nf(bfNow)}%` : "–"}
                  sub={bfNow != null && bfFirst != null && first.dia !== last.dia ? t("med.desde", { d: `${bfNow - bfFirst > 0 ? "+" : ""}${nf(Math.round((bfNow - bfFirst) * 10) / 10)} pp`, data: df(first.dia, { day: "numeric", month: "short" }) }) : t("med.estimativaMarinha")}
                />
              </dl>
              <div ref={ref} className="relative">
                <svg width={width} height={H} role="img" aria-label={t("med.graficoAria")}>
                  {ticks.map((tk) => (
                    <g key={tk}>
                      <line x1={PAD.left} x2={width - PAD.right} y1={y(tk)} y2={y(tk)} stroke="var(--line)" />
                      <text x={PAD.left - 6} y={y(tk) + 4} textAnchor="end" className="fill-[var(--muted)] text-[11px] tabular-nums">
                        {tk}
                      </text>
                    </g>
                  ))}
                  {hipPts.length > 1 && <path d={path(hipPts)} fill="none" stroke="var(--chart-2)" strokeWidth={2} />}
                  {hipPts.map((p) => (
                    <circle key={`h${p.dia}`} cx={x(p.dia)} cy={y(p.v)} r={3.5} fill="var(--chart-2)" />
                  ))}
                  {waistPts.length > 1 && <path d={path(waistPts)} fill="none" stroke="var(--chart-1)" strokeWidth={2.5} />}
                  {waistPts.map((p) => (
                    <circle key={`w${p.dia}`} cx={x(p.dia)} cy={y(p.v)} r={4} fill="var(--chart-1)" />
                  ))}
                  <text x={PAD.left} y={H - 6} className="fill-[var(--muted)] text-[11px]">
                    {df(first.dia, { day: "numeric", month: "short" })}
                  </text>
                  <text x={width - PAD.right} y={H - 6} textAnchor="end" className="fill-[var(--muted)] text-[11px]">
                    {df(last.dia, { day: "numeric", month: "short" })}
                  </text>
                </svg>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-chart-1" /> {t("med.cintura")}
                </span>
                {hipPts.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-chart-2" /> {t("med.anca")}
                  </span>
                )}
                <span>{t("med.cm")}</span>
              </div>
            </>
          );
        })()
      )}
    </section>
  );
}

function Kpi({ k, v, sub }: { k: string; v: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card-2 p-3">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-0.5 text-base font-semibold">{v}</dd>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
