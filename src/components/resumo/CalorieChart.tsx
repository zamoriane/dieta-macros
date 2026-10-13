"use client";
import { useState } from "react";
import { niceMax, useWidth } from "./useWidth";

export type CalDay = { dia: string; kcal: number | null; gasto: number | null; deficit: number | null };

const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 44 };

const wd = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "short" }).replace(".", "").slice(0, 3);
const dm = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" });

/**
 * Ingerido (barras) vs gasto (linha), no mesmo eixo de kcal.
 * Dias sem registo aparecem como contorno tracejado — nunca como zero.
 */
export function CalorieChart({ days, weekly }: { days: CalDay[]; weekly: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const maxV = Math.max(1, ...days.flatMap((d) => [d.kcal ?? 0, d.gasto ?? 0]));
  const yMax = niceMax(maxV * 1.05, 500);
  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, days.length);
  const barW = Math.max(3, Math.min(28, band * 0.6));
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMax * t));

  // Linha do gasto, com quebras onde não há valor
  const segments: string[] = [];
  let cur = "";
  days.forEach((d, i) => {
    if (d.gasto == null) {
      if (cur) segments.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(d.gasto).toFixed(1)}`;
  });
  if (cur) segments.push(cur);

  const labelEvery = weekly ? 1 : Math.ceil(days.length / 6);
  const h = hover != null ? days[hover] : null;

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} role="img" aria-label="Calorias ingeridas e gastas por dia" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--muted)] text-[11px] tabular-nums">
              {t >= 1000 ? `${(t / 1000).toLocaleString("pt-PT")}k` : t}
            </text>
          </g>
        ))}

        {days.map((d, i) => {
          const cx = x(i);
          const active = hover === i;
          if (d.kcal == null) {
            return (
              <rect
                key={d.dia}
                x={cx - barW / 2}
                y={y(0) - 18}
                width={barW}
                height={18}
                rx={4}
                fill="none"
                stroke="var(--muted)"
                strokeDasharray="3 3"
                opacity={active ? 0.9 : 0.5}
              />
            );
          }
          const top = y(d.kcal);
          const hgt = Math.max(2, y(0) - top);
          const r = Math.min(4, barW / 2, hgt);
          // Barra com cantos arredondados só em cima, ancorada à base
          const path = `M${cx - barW / 2},${y(0)} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${y(0)} Z`;
          return <path key={d.dia} d={path} fill="var(--chart-1)" opacity={hover == null || active ? 1 : 0.55} />;
        })}

        {segments.map((p, i) => (
          <path key={i} d={p} fill="none" stroke="var(--chart-2)" strokeWidth={2} strokeLinejoin="round" />
        ))}
        {days.map((d, i) =>
          d.gasto != null ? (
            <circle key={d.dia} cx={x(i)} cy={y(d.gasto)} r={hover === i ? 5 : 4} fill="var(--chart-2)" stroke="var(--card)" strokeWidth={2} />
          ) : null,
        )}

        {days.map((d, i) =>
          i % labelEvery === 0 || i === days.length - 1 ? (
            <text key={d.dia} x={x(i)} y={H - 8} textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
              {weekly ? wd(d.dia) : new Date(d.dia + "T12:00:00").getDate()}
            </text>
          ) : null,
        )}

        {/* Zonas de hover maiores do que as marcas */}
        {days.map((d, i) => (
          <rect key={d.dia} x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>

      {h && hover != null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(0, x(hover) - 80), width - 170) }}
        >
          <div className="mb-1 font-semibold first-letter:uppercase">{dm(h.dia)}</div>
          {h.kcal == null ? (
            <div className="text-muted">Sem registo</div>
          ) : (
            <div className="tabular space-y-0.5">
              <Row color="var(--chart-1)" k="Ingerido" v={`${h.kcal} kcal`} />
              <Row color="var(--chart-2)" k="Gasto" v={h.gasto != null ? `${h.gasto} kcal` : "–"} />
              {h.deficit != null && (
                <div className="flex justify-between gap-4 border-t border-line pt-0.5">
                  <span className="text-muted">{h.deficit >= 0 ? "Défice" : "Excedente"}</span>
                  <span className="font-semibold">{Math.abs(h.deficit)} kcal</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <Legend swatch={<span className="h-2.5 w-3 rounded-sm bg-chart-1" />} label="Ingerido" />
        <Legend swatch={<span className="h-0.5 w-4 rounded bg-chart-2" />} label="Gasto" />
        <Legend swatch={<span className="h-2.5 w-3 rounded-sm border border-dashed border-muted" />} label="Sem registo" />
      </div>
    </div>
  );
}

function Row({ color, k, v }: { color: string; k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {k}
      </span>
      <span className="font-medium text-ink">{v}</span>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  );
}
