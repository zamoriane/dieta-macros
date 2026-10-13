import { Icon, type IconName } from "./Icon";

export function SectionCard({
  title,
  action,
  children,
  className = "",
  padded = true,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card ${padded ? "p-4 sm:p-5" : ""} ${className}`}>
      {(title || action) && (
        <div className={`mb-3 flex items-center justify-between gap-2 ${padded ? "" : "px-4 pt-4 sm:px-5"}`}>
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "accent";

const TONE: Record<Tone, string> = {
  neutral: "bg-card-2 text-muted",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  accent: "bg-accent-soft text-accent",
};

export function StatusBadge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE[tone]}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

/** Selo da origem de um dado (Oura / Apple Watch / estimativa). */
export function SourceBadge({ source }: { source: "oura" | "apple" | "estim" }) {
  const label = source === "oura" ? "Oura" : source === "apple" ? "Watch" : "Estim.";
  return (
    <span className="rounded-md border border-line px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span>
  );
}

export function EmptyState({ icon = "info", title, children }: { icon?: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name={icon} />
      </span>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/**
 * Barra de progresso que mostra o excesso: quando o valor passa a meta, a escala
 * estende-se, aparece um marcador na meta e a parte excedente fica destacada.
 */
export function ProgressBar({ value, target, color, label }: { value: number; target: number; color: string; label: string }) {
  const max = Math.max(target, value) || 1;
  const fill = Math.min(value, target) / max;
  const over = value > target ? (value - target) / max : 0;
  const markerAt = target / max;
  return (
    <div
      className="relative h-2.5 w-full overflow-hidden rounded-full bg-card-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(target)}
      aria-valuenow={Math.round(value)}
    >
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill * 100}%`, background: `var(--${color})` }} />
      {over > 0 && (
        <>
          <div
            className="absolute inset-y-0"
            style={{
              left: `${markerAt * 100}%`,
              width: `${over * 100}%`,
              background: `repeating-linear-gradient(135deg, var(--${color}) 0 4px, transparent 4px 7px)`,
              opacity: 0.9,
            }}
          />
          <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `calc(${markerAt * 100}% - 1px)` }} />
        </>
      )}
    </div>
  );
}

export function DateNavigator({
  label,
  sublabel,
  onPrev,
  onNext,
  nextDisabled,
  onToday,
  isToday,
}: {
  label: string;
  sublabel?: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  onToday?: () => void;
  isToday?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button className="icon-btn" onClick={onPrev} aria-label="Dia anterior">
        <Icon name="chevronLeft" />
      </button>
      <div className="min-w-0 flex-1 text-center sm:flex-none sm:px-2">
        <div className="truncate text-sm font-semibold capitalize">{label}</div>
        {sublabel && <div className="truncate text-xs capitalize text-muted">{sublabel}</div>}
      </div>
      <button className="icon-btn" onClick={onNext} disabled={nextDisabled} aria-label="Dia seguinte" style={nextDisabled ? { opacity: 0.3 } : undefined}>
        <Icon name="chevronRight" />
      </button>
      {!isToday && onToday && (
        <button className="btn btn-ghost ml-1 !min-h-9 !px-3 text-xs" onClick={onToday}>
          Hoje
        </button>
      )}
    </div>
  );
}

export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
