import type { Macros, Targets, EnergyBalance } from "@/lib/nutrition";

export function MacroBar({ label, value, target, color }: { label: string; value: number; target?: number; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = target ? value > target * 1.05 : false;
  return (
    <div>
      <div className="tabular flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={over ? "text-bad font-medium" : ""}>
          {Math.round(value)}
          {target ? <span className="text-muted"> / {target} g</span> : " g"}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `var(--${color})` }} />
      </div>
    </div>
  );
}

export function DaySummary({
  totals,
  targets,
  balance,
  projected,
  liveActivity,
}: {
  totals: Macros;
  targets?: Targets;
  balance?: EnergyBalance;
  projected?: boolean;
  liveActivity?: number | null;
}) {
  const remaining = targets ? targets.kcal - totals.kcal : null;
  const pct = targets ? Math.min(1, totals.kcal / targets.kcal) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={remaining != null && remaining < 0 ? "var(--bad)" : "var(--accent)"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${pct * C} ${C}`}
          />
          <text x="60" y="58" textAnchor="middle" className="fill-current text-[22px] font-semibold" transform="rotate(90 60 60)">
            {totals.kcal}
          </text>
          <text x="60" y="78" textAnchor="middle" className="fill-[var(--muted)] text-[11px]" transform="rotate(90 60 60)">
            {targets ? `de ${targets.kcal} kcal` : "kcal"}
          </text>
        </svg>
        <div className="min-w-0 flex-1 space-y-2.5">
          <MacroBar label="Proteína" value={totals.protein} target={targets?.protein} color="prot" />
          <MacroBar label="Carboidratos" value={totals.carbs} target={targets?.carbs} color="carb" />
          <MacroBar label="Gordura" value={totals.fat} target={targets?.fat} color="fat" />
          <div className="tabular text-xs text-muted">Fibra {totals.fiber} g</div>
        </div>
      </div>

      {balance && (
        <div className="tabular mt-4 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-line pt-3 text-sm sm:grid-cols-4">
          <Row k="Basal (TMB)" v={balance.bmr} />
          <Row
            k={projected ? "Atividade (prevista)" : balance.source === "oura" ? "Atividade (Oura)" : "Atividade (estim.)"}
            v={balance.activity}
          />
          <Row k="Gasto total" v={balance.expenditure} strong />
          <Row k="Ingerido" v={balance.intake} />
          <div className="col-span-2 mt-2 flex items-baseline justify-between rounded-xl bg-bg px-3 py-2 sm:col-span-4">
            <span className="text-muted">
              {balance.deficit >= 0 ? "Défice" : "Excedente"}
              {projected ? " previsto" : ""}
            </span>
            <span className={`text-xl font-semibold ${balance.deficit >= 0 ? "text-good" : "text-bad"}`}>
              {Math.abs(balance.deficit)} kcal
            </span>
          </div>
          {projected && liveActivity != null && (
            <p className="col-span-2 mt-1 text-xs text-muted sm:col-span-4">
              Atividade até agora (Oura, corrigida): {liveActivity} kcal. A previsão usa a sua média dos últimos 14 dias.
            </p>
          )}
          {balance.ouraTotal != null && (
            <p className="col-span-2 mt-1 text-xs text-muted sm:col-span-4">
              Referência do Oura (total do dia): {balance.ouraTotal} kcal.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return (
    <div className="flex justify-between sm:block">
      <div className="text-xs text-muted">{k}</div>
      <div className={strong ? "font-semibold" : ""}>{v} kcal</div>
    </div>
  );
}
