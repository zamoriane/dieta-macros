"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type ToastMsg = { id: number; text: string; kind: "ok" | "erro"; action?: { label: string; run: () => void } };

/** Mostra uma mensagem curta no fundo do ecrã. Pode levar uma ação (ex.: "Desfazer"). */
export function toast(text: string, opts: { kind?: "ok" | "erro"; action?: ToastMsg["action"] } = {}) {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { text, kind: opts.kind ?? "ok", action: opts.action } }));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<ToastMsg, "id">;
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-2), { ...d, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), d.action ? 6000 : 3000);
    };
    window.addEventListener("app-toast", on);
    return () => window.removeEventListener("app-toast", on);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="anim-sheet pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-bg shadow-lg"
        >
          <Icon name={t.kind === "erro" ? "alert" : "check"} size={18} />
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button
              className="shrink-0 font-semibold underline underline-offset-2"
              onClick={() => {
                t.action!.run();
                setItems((xs) => xs.filter((x) => x.id !== t.id));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
