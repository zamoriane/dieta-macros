import type { Macros, Targets } from "@/lib/nutrition";
import { ProgressBar, SectionCard } from "@/components/ui/Primitives";

const MACROS = [
  { key: "protein", label: "Proteína", color: "prot" },
  { key: "carbs", label: "Carboidratos", color: "carb" },
  { key: "fat", label: "Gordura", color: "fat" },
] as const;

export function MacroCard({ totals, targets, sex }: { totals: Macros; targets?: Targets; sex?: "M" | "F" | null }) {
  // Referências de fibra: EFSA (2010) 25 g/dia adultos; IOM (2005) 38 g/dia homens ≤50, 25 g mulheres (14 g/1000 kcal)
  const fiberRef = sex === "F" ? "25 g/dia (EFSA e IOM)" : sex === "M" ? "25 g (EFSA) a 38 g/dia (IOM, homens)" : "25–38 g/dia (EFSA/IOM)";
  return (
    <SectionCard title="Macronutrientes">
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
                  {m.label}
                </span>
                <span>
                  <span className="font-semibold">{Math.round(v)}</span>
                  {t != null && <span className="text-muted"> / {t} g</span>}
                  {over > 0 && <span className="ml-1.5 text-xs font-semibold text-warn">+{over} g</span>}
                </span>
              </div>
              {t != null ? (
                <ProgressBar value={v} target={t} color={m.color} label={`${m.label}: ${Math.round(v)} de ${t} g`} />
              ) : (
                <div className="h-2.5 rounded-full bg-card-2" />
              )}
            </li>
          );
        })}
        <li className="flex items-baseline justify-between gap-2 border-t border-line pt-3 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-fiber" aria-hidden="true" />
            Fibra
          </span>
          <span className="tabular text-right">
            <span className="font-semibold">{Math.round(totals.fiber)} g</span>
            <span className="block text-[11px] text-muted">Referência: {fiberRef}</span>
          </span>
        </li>
      </ul>
    </SectionCard>
  );
}
