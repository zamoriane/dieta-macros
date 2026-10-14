import type { Macros, Targets } from "@/lib/nutrition";
import { ProgressBar, SectionCard } from "@/components/ui/Primitives";
import { useI18n } from "@/lib/i18n/client";

const MACROS = [
  { key: "protein", label: "macro.proteina", color: "prot" },
  { key: "carbs", label: "macro.hidratos", color: "carb" },
  { key: "fat", label: "macro.gordura", color: "fat" },
] as const;

export function MacroCard({
  totals,
  targets,
  sex,
  water,
}: {
  totals: Macros;
  targets?: Targets;
  sex?: "M" | "F" | null;
  water?: { total: number; drinks: number; efsa: number; byEnergy: number; exercise: number };
}) {
  const { t: tr, nf } = useI18n();
  // Referências de fibra: EFSA (2010) 25 g/dia adultos; IOM (2005) 38 g/dia homens ≤50, 25 g mulheres (14 g/1000 kcal)
  const fiberRef = sex === "F" ? tr("macro.fibraRefF") : sex === "M" ? tr("macro.fibraRefM") : tr("macro.fibraRef");
  return (
    <SectionCard title={tr("macro.titulo")}>
      <ul className="space-y-4">
        {MACROS.map((m) => {
          const v = totals[m.key];
          const t = targets?.[m.key];
          const over = t != null && v > t ? Math.round(v - t) : 0;
          return (
            <li key={m.key}>
              <div className="tabular mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--${m.color})` }} aria-hidden="true" />
                  {tr(m.label)}
                </span>
                <span>
                  <span className="font-semibold">{Math.round(v)}</span>
                  {t != null && <span className="text-muted"> / {t} g</span>}
                  {over > 0 && <span className="ml-1.5 text-xs font-semibold text-warn">+{over} g</span>}
                </span>
              </div>
              {t != null ? (
                <ProgressBar value={v} target={t} color={m.color} label={tr("macro.barra", { nome: tr(m.label), v: Math.round(v), meta: t })} />
              ) : (
                <div className="h-2.5 rounded-full bg-card-2" />
              )}
            </li>
          );
        })}
        <li className="flex items-baseline justify-between gap-2 border-t border-line pt-3 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-fiber" aria-hidden="true" />
            {tr("macro.fibra")}
          </span>
          <span className="tabular text-right">
            <span className="font-semibold">{Math.round(totals.fiber)} g</span>
            <span className="block text-[11px] text-muted">{tr("macro.referencia", { ref: fiberRef })}</span>
          </span>
        </li>
      </ul>

      {water && (
        <details className="group mt-3 border-t border-line pt-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium">
              <span className="h-2.5 w-2.5 rounded-full bg-prot" aria-hidden="true" />
              {tr("agua.titulo")}
            </span>
            <span className="tabular text-right">
              <span className="font-semibold">≈ {nf(water.drinks)} L</span>
              <span className="block text-[11px] text-muted">{tr("agua.beber", { total: nf(water.total) })}</span>
            </span>
          </summary>
          <div className="mt-2 space-y-1 rounded-xl bg-card-2 p-3 text-xs text-muted">
            <p>
              {tr("agua.explica", { efsa: nf(water.efsa), energia: nf(water.byEnergy) })}
              {water.exercise > 0 ? tr("agua.treino", { l: nf(water.exercise) }) : ""}
              {tr("agua.alimentos")}
            </p>
            <p>{tr("agua.aviso")}</p>
          </div>
        </details>
      )}
    </SectionCard>
  );
}
