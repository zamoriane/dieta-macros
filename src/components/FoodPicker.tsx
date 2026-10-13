"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { scale } from "@/lib/nutrition";
import { getUserId, type Food } from "@/lib/data";

type Props = {
  title?: string;
  onPick: (food: Food, grams: number) => Promise<void> | void;
  onClose: () => void;
};

export function FoodPicker({ title = "Adicionar alimento", onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");
  const [creating, setCreating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setFoods([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q.trim())}`);
        const j = await res.json();
        setFoods(j.foods ?? []);
        if (j.apiError) setErr(j.apiError);
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    }, 450);
  }, [q]);

  const g = Number(grams.replace(",", "."));
  const preview = selected && g > 0 ? scale(selected, g) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-card shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">{selected ? selected.name : creating ? "Novo alimento" : title}</h2>
          <button onClick={onClose} className="text-muted" aria-label="Fechar">
            ✕
          </button>
        </div>

        {creating ? (
          <CustomFoodForm
            initialName={q}
            onCancel={() => setCreating(false)}
            onCreated={(f) => {
              setCreating(false);
              setSelected(f);
              setGrams("100");
            }}
          />
        ) : !selected ? (
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <input
              autoFocus
              className="w-full"
              placeholder="Buscar (ex.: aveia, ovo, frango)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted">A base é sobretudo em inglês: experimente “oats”, “egg”, “chicken breast”.</p>
            <ul className="mt-3 min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {loading && <li className="py-3 text-sm text-muted">Buscando…</li>}
              {!loading &&
                foods.map((f) => (
                  <li key={f.id}>
                    <button
                      className="w-full py-2.5 text-left"
                      onClick={() => {
                        setSelected(f);
                        setGrams(String(f.portions?.[0]?.grams ?? 100));
                      }}
                    >
                      <div className="text-sm font-medium">
                        {f.name}
                        {f.brand && <span className="text-muted"> · {f.brand}</span>}
                        {f.source === "custom" && <span className="ml-1 rounded bg-accent/15 px-1.5 text-xs text-accent">meu</span>}
                      </div>
                      <div className="tabular text-xs text-muted">
                        100 g: {Math.round(f.kcal_100g)} kcal · P {f.protein_100g} · C {f.carbs_100g} · G {f.fat_100g}
                      </div>
                    </button>
                  </li>
                ))}
              {!loading && q.length >= 2 && foods.length === 0 && <li className="py-3 text-sm text-muted">Nada encontrado.</li>}
            </ul>
            {err && <p className="mt-2 text-xs text-warn">{err}</p>}
            <button className="mt-3 text-sm text-accent" onClick={() => setCreating(true)}>
              + Criar alimento próprio
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div>
              <label className="text-sm text-muted">Quantidade (g)</label>
              <input
                autoFocus
                inputMode="decimal"
                className="tabular mt-1 w-full text-lg"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
              />
              {selected.portions?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.portions.slice(0, 6).map((p) => (
                    <button
                      key={p.label + p.grams}
                      onClick={() => setGrams(String(p.grams))}
                      className="rounded-full border border-line px-3 py-1 text-xs"
                    >
                      {p.label} ({p.grams} g)
                    </button>
                  ))}
                </div>
              )}
            </div>
            {preview && (
              <div className="tabular grid grid-cols-4 gap-2 text-center text-sm">
                <Stat label="kcal" value={Math.round(preview.kcal)} />
                <Stat label="Prot." value={preview.protein} color="text-prot" />
                <Stat label="Carb." value={preview.carbs} color="text-carb" />
                <Stat label="Gord." value={preview.fat} color="text-fat" />
              </div>
            )}
            <div className="flex gap-2">
              <button className="flex-1 rounded-xl border border-line py-2.5" onClick={() => setSelected(null)}>
                Voltar
              </button>
              <button
                disabled={!(g > 0)}
                className="flex-1 rounded-xl bg-accent py-2.5 font-medium text-white disabled:opacity-50"
                onClick={async () => {
                  await onPick(selected, g);
                  onClose();
                }}
              >
                Adicionar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = "" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl bg-bg py-2">
      <div className={`text-base font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function CustomFoodForm({ initialName, onCancel, onCreated }: { initialName: string; onCancel: () => void; onCreated: (f: Food) => void }) {
  const sb = createClient();
  const [f, setF] = useState({ name: initialName, kcal: "", p: "", c: "", g: "", fib: "" });
  const [err, setErr] = useState<string | null>(null);
  const n = (s: string) => Number(s.replace(",", ".")) || 0;

  async function save() {
    if (!f.name.trim() || !f.kcal) return setErr("Nome e kcal são obrigatórios.");
    const userId = await getUserId(sb);
    const { data, error } = await sb
      .from("foods")
      .insert({
        user_id: userId,
        source: "custom",
        name: f.name.trim(),
        kcal_100g: n(f.kcal),
        protein_100g: n(f.p),
        carbs_100g: n(f.c),
        fat_100g: n(f.g),
        fiber_100g: n(f.fib),
      })
      .select("*")
      .single();
    if (error) return setErr(error.message);
    onCreated(data as Food);
  }

  const field = (key: keyof typeof f, label: string) => (
    <label className="text-sm">
      <span className="text-muted">{label}</span>
      <input inputMode="decimal" className="tabular mt-1 w-full" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="space-y-3 p-4">
      <label className="block text-sm">
        <span className="text-muted">Nome</span>
        <input className="mt-1 w-full" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <p className="text-xs text-muted">Valores por 100 g (veja o rótulo da embalagem).</p>
      <div className="grid grid-cols-2 gap-3">
        {field("kcal", "kcal")}
        {field("p", "Proteína (g)")}
        {field("c", "Carboidratos (g)")}
        {field("g", "Gordura (g)")}
        {field("fib", "Fibra (g)")}
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex gap-2">
        <button className="flex-1 rounded-xl border border-line py-2.5" onClick={onCancel}>
          Cancelar
        </button>
        <button className="flex-1 rounded-xl bg-accent py-2.5 font-medium text-white" onClick={save}>
          Guardar
        </button>
      </div>
    </div>
  );
}
