"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * Largura real do contentor, para desenhar SVG em píxeis (texto nunca distorce).
 * Usa um callback ref: funciona mesmo quando o elemento só aparece depois (ex.: dados a carregar).
 */
export function useWidth<T extends HTMLElement>(initial = 320) {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(initial);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width) || initial);
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, initial]);
  return [ref, w] as const;
}

/** Arredonda o máximo do eixo para um valor "bonito". */
export function niceMax(v: number, step: number) {
  return Math.max(step, Math.ceil(v / step) * step);
}
