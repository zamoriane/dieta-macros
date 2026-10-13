import Link from "next/link";
import type { EnergyBalance, Macros, Targets } from "@/lib/nutrition";
import { SourceBadge, StatusBadge, type Tone } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";

function status(intake: number, target: number): { tone: Tone; text: string } {
  if (intake === 0) return { tone: "neutral", text: "Ainda sem registos" };
  const diff = target - intake;
  const pct = Math.abs(diff) / target;
  if (pct <= 0.05) return { tone: "good", text: "Muito perto da meta" };
  if (diff > 0) return { tone: "accent", text: `Faltam ${Math.round(diff)} kcal` };
  if (pct <= 0.1) return { tone: "warn", text: `${Math.round(-diff)} kcal acima` };
  return { tone: "bad", text: `${Math.round(-diff)} kcal acima` };
}

function Ring({ intake, target, tone }: { intake: number; target: number; tone: Tone }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const pct = target > 0 ? Math.min(1, intake / target) : 0;
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--ring)";
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36 shrink-0 sm:h-40 sm:w-40" role="img" aria-label={`${intake} de ${target} kcal`}>
      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--card-2)" strokeWidth="11" />
      <circle
        cx="64"
        cy="64"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${pct * C} ${C}`}
        transform="rotate(-90 64 64)"
        style={{ transition: "stroke-dasharray 400ms ease-out" }}
      />
      <text x="64" y="62" textAnchor="middle" className="fill-[var(--ink)] text-[26px] font-bold tabular-nums">
        {intake}
      </text>
      <text x="64" y="82" textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
        de {target} kcal
      </text>
    </svg>
  );
}

export function CalorieCard({
  totals,
  targets,
  balance,
  projected,
  liveActivity,
  source,
  deficitTarget,
  isToday,
}: {
  totals: Macros;
  targets?: Targets;
  balance?: EnergyBalance;
  projected?: boolean;
  liveActivity?: number | null;
  source: "oura" | "apple";
  deficitTarget?: number;
  isToday: boolean;
}) {
  if (!targets || !balance) {
    return (
      <section className="card p-5">
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold tabular-nums">{totals.kcal}</div>
          <div className="text-sm text-muted">kcal ingeridas</div>
        </div>
        <Link href="/perfil" className="mt-4 flex items-center gap-2 rounded-xl bg-accent-soft p-3 text-sm font-medium text-accent">
          <Icon name="info" size={18} /> Complete o perfil e registe o peso para ver metas, gasto e défice
          <Icon name="chevronRight" size={16} className="ml-auto" />
        </Link>
      </section>
    );
  }

  const st = status(totals.kcal, targets.kcal);
  const deficit = balance.deficit;
  const deficitLabel = deficit >= 0 ? (isToday ? "Défice previsto" : "Défice do dia") : isToday ? "Excedente previsto" : "Excedente do dia";
  const deficitTone = deficit < 0 ? "text-bad" : deficitTarget && deficit >= deficitTarget * 0.8 ? "text-good" : "text-ink";
  const actSource = balance.source === "oura" ? source : "estim";

  return (
    <section className="card p-5" aria-label="Calorias do dia">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <Ring intake={totals.kcal} target={targets.kcal} tone={st.tone} />
        <div className="w-full min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Calorias</h2>
            <StatusBadge tone={st.tone}>{st.text}</StatusBadge>
          </div>
          <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Ingerido</dt>
              <dd className="text-lg font-semibold">{balance.intake}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Meta de ingestão</dt>
              <dd className="text-lg font-semibold">{targets.kcal}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                Gasto {projected ? "previsto" : "total"} <SourceBadge source={actSource} />
              </dt>
              <dd className="text-lg font-semibold">{balance.expenditure}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{deficitLabel}</dt>
              <dd className={`text-lg font-semibold ${deficitTone}`}>
                {Math.abs(deficit)}
                {deficitTarget ? <span className="ml-1 text-xs font-normal text-muted">alvo {deficitTarget}</span> : null}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <details className="group mt-4 border-t border-line pt-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted hover:text-ink">
          Como é calculado
          <Icon name="chevronDown" size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="tabular mt-3 space-y-1.5 text-sm">
          <Row k="Basal (Mifflin-St Jeor)" v={balance.bmr} />
          <Row k={projected ? "Atividade prevista (média 14 dias)" : "Atividade (corrigida)"} v={balance.activity} />
          {projected && liveActivity != null && <Row k="Atividade até agora" v={liveActivity} muted />}
          <Row k="Gasto" v={balance.expenditure} strong />
          <Row k="− Ingerido" v={balance.intake} />
          <Row k={deficit >= 0 ? "= Défice" : "= Excedente"} v={Math.abs(deficit)} strong />
          {balance.ouraTotal != null && <Row k="Referência: total do dia no Oura" v={balance.ouraTotal} muted />}
        </div>
      </details>
    </section>
  );
}

function Row({ k, v, strong, muted }: { k: string; v: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${muted ? "text-muted" : ""}`}>
      <span>{k}</span>
      <span className={strong ? "font-semibold" : ""}>{v} kcal</span>
    </div>
  );
}
