import Link from "next/link";
import type { EnergyBalance, Macros, Targets } from "@/lib/nutrition";
import { SourceBadge, StatusBadge, type Tone } from "@/components/ui/Primitives";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n/client";

type T = ReturnType<typeof useI18n>["t"];

function status(t: T, intake: number, target: number): { tone: Tone; text: string } {
  if (intake === 0) return { tone: "neutral", text: t("cal.semRegistos") };
  const diff = target - intake;
  const pct = Math.abs(diff) / target;
  if (pct <= 0.05) return { tone: "good", text: t("cal.pertoMeta") };
  if (diff > 0) return { tone: "accent", text: t("cal.faltam", { kcal: Math.round(diff) }) };
  if (pct <= 0.1) return { tone: "warn", text: t("cal.acima", { kcal: Math.round(-diff) }) };
  return { tone: "bad", text: t("cal.acima", { kcal: Math.round(-diff) }) };
}

/** Anel: preenche com o que já foi comido; no centro, o que ainda falta (ou o excesso). */
function Ring({ intake, target, tone }: { intake: number; target: number; tone: Tone }) {
  const { t } = useI18n();
  const left = Math.round(target - intake);
  const R = 54;
  const C = 2 * Math.PI * R;
  const pct = target > 0 ? Math.min(1, intake / target) : 0;
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--ring)";
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36 shrink-0 sm:h-40 sm:w-40" role="img" aria-label={t("cal.deKcal", { v: intake, meta: target })}>
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
      <text x="64" y="62" textAnchor="middle" className={`text-[26px] font-bold tabular-nums ${left < 0 ? "fill-[var(--bad)]" : "fill-[var(--ink)]"}`}>
        {Math.abs(left)}
      </text>
      <text x="64" y="82" textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
        {left < 0 ? t("cal.kcalAcima") : t("cal.restam")}
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
  planned,
  pending,
  status: dayStatus,
}: {
  totals: Macros;
  targets?: Targets;
  balance?: EnergyBalance;
  projected?: boolean;
  liveActivity?: number | null;
  source: "oura" | "apple";
  deficitTarget?: number;
  isToday: boolean;
  /** kcal planeadas para o dia e ainda por confirmar (só com a migração 0012) */
  planned?: number;
  pending?: number;
  status?: "sem_registo" | "parcial" | "completo";
}) {
  const { t } = useI18n();
  if (!targets || !balance) {
    return (
      <section className="card p-5">
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold tabular-nums">{totals.kcal}</div>
          <div className="text-sm text-muted">{t("cal.kcalIngeridas")}</div>
        </div>
        <Link href="/perfil" className="mt-4 flex items-center gap-2 rounded-xl bg-accent-soft p-3 text-sm font-medium text-accent">
          <Icon name="info" size={18} /> {t("cal.completePerfil")}
          <Icon name="chevronRight" size={16} className="ml-auto" />
        </Link>
      </section>
    );
  }

  const st =
    totals.kcal === 0 && (pending ?? 0) > 0 ? { tone: "neutral" as Tone, text: t("consumo.nadaConfirmado") } : status(t, totals.kcal, targets.kcal);
  const deficit = balance.deficit;
  const deficitLabel = deficit >= 0 ? (isToday ? t("cal.deficePrevisto") : t("cal.deficeDia")) : isToday ? t("cal.excedentePrevisto") : t("cal.excedenteDia");
  const deficitTone = deficit < 0 ? "text-bad" : deficitTarget && deficit >= deficitTarget * 0.8 ? "text-good" : "text-ink";
  const actSource = balance.source === "oura" ? source : "estim";

  return (
    <section className="card p-5" aria-label={t("cal.doDia")}>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <Ring intake={totals.kcal} target={targets.kcal} tone={st.tone} />
        <div className="w-full min-w-0 flex-1 space-y-3">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("cal.calorias")}</h2>
              <StatusBadge tone={st.tone}>{st.text}</StatusBadge>
            </div>
            <p className="mt-0.5 text-xs text-muted">{t("cal.formula")}</p>
          </div>
          <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Stat icon="flag" color="text-muted" label={t("cal.metaIngestao")} value={targets.kcal} />
            <Stat icon="utensils" color="text-[var(--chart-2)]" label={t("cal.ingerido")} value={balance.intake} />
            <Stat
              icon="flame"
              color="text-warn"
              label={
                <>
                  {projected ? t("cal.gastoPrevisto") : t("cal.gastoTotal")} <SourceBadge source={actSource} />
                </>
              }
              value={balance.expenditure}
            />
            <Stat
              icon="target"
              color={deficit < 0 ? "text-bad" : "text-good"}
              label={deficitLabel}
              value={
                <span className={deficitTone}>
                  {Math.abs(deficit)}
                  {deficitTarget ? <span className="ml-1 text-xs font-normal text-muted">{t("cal.alvo", { v: deficitTarget })}</span> : null}
                </span>
              }
            />
          </dl>
          {planned != null && planned > 0 && (
            <p className="tabular text-xs text-muted">
              {t("consumo.linhaPlano", { plano: planned, pendente: pending ?? 0 })}
              {!isToday && dayStatus === "parcial" ? ` · ${t("consumo.estadoParcialCurto")}` : ""}
            </p>
          )}
        </div>
      </div>

      <details className="group mt-4 border-t border-line pt-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted hover:text-ink">
          {t("cal.comoCalculado")}
          <Icon name="chevronDown" size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="tabular mt-3 space-y-1.5 text-sm">
          <Row k={t("cal.basal")} v={balance.bmr} />
          <Row k={projected ? t("cal.atividadePrevista") : t("cal.atividadeCorrigida")} v={balance.activity} />
          {projected && liveActivity != null && <Row k={t("cal.atividadeAgora")} v={liveActivity} muted />}
          <Row k={t("cal.gasto")} v={balance.expenditure} strong />
          <Row k={`− ${t("cal.ingerido")}`} v={balance.intake} />
          <Row k={deficit >= 0 ? `= ${t("cal.defice")}` : `= ${t("cal.excedente")}`} v={Math.abs(deficit)} strong />
          {balance.ouraTotal != null && <Row k={t("cal.refOura")} v={balance.ouraTotal} muted />}
        </div>
      </details>
    </section>
  );
}

function Stat({ icon, color, label, value }: { icon: IconName; color: string; label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon name={icon} size={20} className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <dt className="flex flex-wrap items-center gap-1.5 text-xs text-muted">{label}</dt>
        <dd className="text-lg font-semibold leading-tight">{value}</dd>
      </div>
    </div>
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
