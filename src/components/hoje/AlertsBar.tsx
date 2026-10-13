"use client";
import { useState } from "react";
import type { Alert } from "@/lib/nutrition";
import { Icon } from "@/components/ui/Icon";

const ORDER = { alerta: 0, aviso: 1, info: 2 } as const;
const STYLE = {
  alerta: "border-bad/30 bg-bad-soft text-ink",
  aviso: "border-warn/30 bg-warn-soft text-ink",
  info: "border-line bg-card text-ink",
};
const ICON_COLOR = { alerta: "text-bad", aviso: "text-warn", info: "text-accent" };

/** Mostra o alerta mais importante; os restantes ficam a um toque. */
export function AlertsBar({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);
  if (!alerts.length) return null;
  const sorted = [...alerts].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const shown = open ? sorted : sorted.slice(0, 1);
  return (
    <div className="space-y-2" role="region" aria-label="Alertas">
      {shown.map((a, i) => (
        <div key={i} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${STYLE[a.level]}`}>
          <Icon name={a.level === "info" ? "info" : "alert"} size={18} className={`mt-0.5 shrink-0 ${ICON_COLOR[a.level]}`} />
          <span className="min-w-0 flex-1">{a.text}</span>
          {i === 0 && sorted.length > 1 && (
            <button className="shrink-0 text-xs font-semibold text-accent" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? "Menos" : `+${sorted.length - 1}`}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
