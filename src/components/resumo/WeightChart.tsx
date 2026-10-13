"use client";
import { useState } from "react";
import { ema } from "@/lib/nutrition";
import { addDays, isoDay } from "@/lib/data";
import { useWidth } from "./useWidth";

type W = { dia: string; kg: number };
const RANGES = [7, 30, 90] as const;
const H = 220;
const PAD = { top: 14, right: 12, bottom: 28, left: 44 };
const MIN_TREND = 7;

const t = (d: string) => new Date(d + "T12:00:00").getTime();
const dm = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
const kg = (v: number) => v.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Evolução do peso: pesagens registadas (pontos) e, com ≥ 7 pesagens, a tendência
 * suavizada (média móvel exponencial), claramente identificada. Linha do peso meta.
 * Períodos sem pesagens ficam vazios — nada é inventado.
 */
export function WeightChart({ weights, goal }: { weights: W[]; goal: number | null }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const sorted = [...weights].sort((a, b) => a.dia.localeCompare(b.dia));
  const trendAll = sorted.length >= MIN_TREND ? ema(sorted.map((w) => w.kg), 0.2) : null;
  const today = isoDay();
  const from = addDays(today, -(range - 1));
  const idx = sorted.map((w, i) => ({ ...w, trend: trendAll?.[i] ?? null })).filter((w) => w.dia >= from);

  const header = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Evolução do peso</h2>
      <div className="flex rounded-lg border border-line bg-card-2 p-0.5 text-xs" role="group" aria-label="Período do gráfico de peso">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`min-h-8 rounded-md px-2.5 font-medium ${range === r ? "bg-card text-ink shadow-sm" : "text-muted"}`}
          >
            {r} dias
          </button>
        ))}
      </div>
    </div>
  );

  if (!idx.length) {
    return (
      <section className="card space-y-3 p-4 sm:p-5">
        {header}
        <p className="py-8 text-center text-sm text-muted">Sem pesagens neste período. Registe o peso no Perfil, idealmente de manhã.</p>
      </section>
    );
  }

  const values = idx.flatMap((w) => [w.kg, w.trend ?? w.kg]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const goalInView = goal != null && goal >= lo - 4 && goal <= hi + 4;
  const yLo = Math.floor((goalInView ? Math.min(lo, goal!) : lo) - 0.5);
  const yHi = Math.ceil((goalInView ? Math.max(hi, goal!) : hi) + 0.5);
  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const x0 = t(from);
  const x1 = t(today);
  const x = (d: string) => PAD.left + ((t(d) - x0) / Math.max(1, x1 - x0)) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - yLo) / Math.max(0.1, yHi - yLo)) * plotH;
  const step = yHi - yLo > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = Math.ceil(yLo / step) * step; v <= yHi; v += step) ticks.push(v);

  const trendPath = idx
    .filter((w) => w.trend != null)
    .map((w, i) => `${i ? "L" : "M"}${x(w.dia).toFixed(1)},${y(w.trend!).toFixed(1)}`)
    .join("");

  // Estatísticas do período
  const first = idx[0];
  const last = idx[idx.length - 1];
  const delta = last.kg - first.kg;
  const days = (t(last.dia) - t(first.dia)) / 86400000;
  const tFirst = first.trend;
  const tLast = last.trend;
  const perWeek = tFirst != null && tLast != null && days >= 6 ? ((tLast - tFirst) / days) * 7 : null;
  const toGoal = goal != null ? (tLast ?? last.kg) - goal : null;

  const xTicks = range === 7 ? idx.map((w) => w.dia) : [from, addDays(from, Math.round(range / 2)), today];
  const h = hover != null ? idx[hover] : null;

  return (
    <section className="card space-y-3 p-4 sm:p-5">
      {header}

      <dl className="tabular grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Última pesagem" v={`${kg(last.kg)} kg`} sub={dm(last.dia)} />
        <Stat k="Variação no período" v={idx.length > 1 ? `${delta > 0 ? "+" : ""}${kg(delta)} kg` : "–"} sub={idx.length > 1 ? `${idx.length} pesagens` : "1 pesagem"} />
        <Stat k="Ritmo (tendência)" v={perWeek != null ? `${perWeek > 0 ? "+" : ""}${kg(perWeek)} kg/sem` : "–"} sub={perWeek == null ? `precisa de ${MIN_TREND}+ pesagens` : "estimado"} />
        <Stat k="Até à meta" v={toGoal != null ? `${kg(Math.max(0, toGoal))} kg` : "–"} sub={goal != null ? `meta ${kg(goal)} kg` : "defina no Perfil"} />
      </dl>

      <div ref={ref} className="relative">
        <svg width={width} height={H} role="img" aria-label="Gráfico de evolução do peso" onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="fill-[var(--muted)] text-[11px] tabular-nums">
                {v}
              </text>
            </g>
          ))}
          {goalInView && (
            <g>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(goal!)} y2={y(goal!)} stroke="var(--muted)" strokeDasharray="5 4" />
              <text x={width - PAD.right} y={y(goal!) - 5} textAnchor="end" className="fill-[var(--muted)] text-[11px]">
                meta {kg(goal!)}
              </text>
            </g>
          )}
          {trendPath && <path d={trendPath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {idx.map((w, i) => (
            <circle key={w.dia} cx={x(w.dia)} cy={y(w.kg)} r={hover === i ? 5.5 : 4} fill="var(--chart-2)" stroke="var(--card)" strokeWidth={2} />
          ))}
          {hover != null && h && <line x1={x(h.dia)} x2={x(h.dia)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />}
          {xTicks.map((d) => (
            <text key={d} x={Math.min(Math.max(x(d), PAD.left + 14), width - PAD.right - 14)} y={H - 8} textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
              {range === 7 ? new Date(d + "T12:00:00").getDate() : dm(d)}
            </text>
          ))}
          {/* hover: ponto mais próximo */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onMouseMove={(e) => {
              const bx = (e.currentTarget as SVGRectElement).getBoundingClientRect().left;
              const mx = e.clientX - bx + PAD.left;
              let best = 0;
              idx.forEach((w, i) => {
                if (Math.abs(x(w.dia) - mx) < Math.abs(x(idx[best].dia) - mx)) best = i;
              });
              setHover(best);
            }}
          />
        </svg>
        {h && hover != null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(0, x(h.dia) - 70), width - 150) }}
          >
            <div className="mb-1 font-semibold">{dm(h.dia)}</div>
            <div className="tabular flex justify-between gap-4">
              <span className="text-muted">Pesagem</span>
              <span className="font-medium">{kg(h.kg)} kg</span>
            </div>
            {h.trend != null && (
              <div className="tabular flex justify-between gap-4">
                <span className="text-muted">Tendência</span>
                <span className="font-medium">{kg(h.trend)} kg</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-chart-2" /> Pesagem
        </span>
        {trendPath ? (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-chart-1" /> Tendência suavizada
          </span>
        ) : (
          <span>Tendência aparece a partir de {MIN_TREND} pesagens</span>
        )}
        {goalInView && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-muted" /> Peso meta
          </span>
        )}
      </div>
    </section>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-card-2 p-3">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="text-base font-semibold">{v}</dd>
      {sub && <dd className="text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}
