"use client";
import { useEffect, useRef, useState } from "react";

// Leaflet carregado do CDN só quando um mapa é aberto (não pesa no resto do app).
const LEAFLET_VERSION = "1.9.4";
type LeafletLike = {
  map: (el: HTMLElement, opts: Record<string, unknown>) => {
    fitBounds: (b: unknown, o?: Record<string, unknown>) => void;
    remove: () => void;
    invalidateSize: () => void;
  };
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (m: unknown) => void };
  polyline: (pts: [number, number][], opts: Record<string, unknown>) => { addTo: (m: unknown) => void; getBounds: () => unknown };
  circleMarker: (p: [number, number], opts: Record<string, unknown>) => { addTo: (m: unknown) => void };
};

let loading: Promise<LeafletLike> | null = null;
function loadLeaflet(): Promise<LeafletLike> {
  const w = window as unknown as { L?: LeafletLike };
  if (w.L) return Promise.resolve(w.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    js.async = true;
    js.onload = () => (w.L ? resolve(w.L) : reject(new Error("Leaflet indisponível")));
    js.onerror = () => {
      loading = null;
      reject(new Error("Não foi possível carregar o mapa"));
    };
    document.head.appendChild(js);
  });
  return loading;
}

export function WorkoutMap({ route, className = "" }: { route: [number, number][]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let map: ReturnType<LeafletLike["map"]> | null = null;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !el.current) return;
        const css = getComputedStyle(document.documentElement);
        const ring = css.getPropertyValue("--ring").trim() || "#0d9488";
        map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        const line = L.polyline(route, { color: ring, weight: 5, opacity: 0.95, lineJoin: "round" });
        line.addTo(map);
        L.circleMarker(route[0], { radius: 7, color: "#fff", weight: 2, fillColor: "#16a34a", fillOpacity: 1 }).addTo(map);
        L.circleMarker(route[route.length - 1], { radius: 7, color: "#fff", weight: 2, fillColor: "#dc2626", fillOpacity: 1 }).addTo(map);
        map.fitBounds(line.getBounds(), { padding: [24, 24] });
        // O diálogo anima ao abrir: recalcula o tamanho depois da animação
        setTimeout(() => map?.invalidateSize(), 250);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route]);

  return (
    <div className={`workout-map relative overflow-hidden rounded-xl border border-line bg-card-2 ${className}`}>
      <div ref={el} className="h-full w-full" role="img" aria-label="Mapa do percurso" />
      {err && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">{err}</p>}
    </div>
  );
}
