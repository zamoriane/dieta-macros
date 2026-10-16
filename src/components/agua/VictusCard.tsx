"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { clockMinutes, victusMood } from "@/lib/victus";
import { drinkName, type WaterConfig } from "@/lib/water";

export function VictusCard({ cfg, consumed, goal, onAdd, onOther, today = true }: {
  cfg: WaterConfig; consumed: number; goal: number; onAdd: (ml: number, beverage: string) => Promise<void>; today?: boolean; onOther: () => void;
}) {
  const { t, nf, locale } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!today) return null;
  const minute = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const mood = victusMood(consumed, goal, minute, clockMinutes(cfg.lembretes.inicio), clockMinutes(cfg.lembretes.fim), now ? cfg.lembretes.dias.includes(now.getDay()) : false);
  const done = consumed >= goal;
  return <section aria-label={t("victus.title")} className={`rounded-3xl border border-line p-5 ${done ? "bg-accent text-on-accent" : "bg-accent-soft text-ink"}`}>
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-widest">Victus · {t("agua.pagina")}</p>
        <h2 className="mt-1 text-xl font-bold" aria-live="polite">{t(mood === "encouraging" && consumed >= goal * 0.75 ? "victus.near" : `victus.${mood}`)}</h2>
        <p className="mt-2 tabular-nums">{nf(consumed)} / {nf(goal)} ml</p>
        <progress className="mt-2 h-2 w-full accent-teal-500" max={Math.max(1, goal)} value={Math.min(consumed, goal)} aria-label={t("victus.progress")} />
      </div>
      {/* Static artwork also used by both native widgets. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/victus/${mood}.svg`} alt="" width={112} height={112} className="h-28 w-28 shrink-0" />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cfg.copos.map((cup, i) => <button key={i} disabled={busy} className="min-h-12 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-teal-900 disabled:opacity-50" onClick={async () => {
        setBusy(true); try { await onAdd(cup.ml, cup.bebida); } finally { setBusy(false); }
      }}>+{nf(cup.ml)} ml <span className="block text-xs font-normal">{drinkName(cup.bebida, locale)}</span></button>)}
      <button className="min-h-12 rounded-2xl bg-white px-3 text-sm font-semibold text-teal-900" onClick={onOther}>{t("agua.outra")}</button>
    </div>
    <p className="mt-3 text-xs opacity-80">{t("victus.hint")}</p>
  </section>;
}
