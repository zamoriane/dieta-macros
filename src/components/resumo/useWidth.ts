"use client";
import { useEffect, useRef, useState } from "react";

/** Largura real do contentor, para desenhar SVG em píxeis (texto nunca distorce). */
export function useWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Arredonda o máximo do eixo para um valor "bonito". */
export function niceMax(v: number, step: number) {
  return Math.max(step, Math.ceil(v / step) * step);
}
