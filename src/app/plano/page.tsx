"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { scale } from "@/lib/nutrition";
import { getPlan, getUserId, sum, type PlanItem, type PlanMeal } from "@/lib/data";
import { FoodPicker } from "@/components/FoodPicker";
import { DaySummary } from "@/components/Summary";

const DEFAULT_MEALS = ["Pequeno-almoço", "Almoço", "Lanche", "Jantar"];

export default function PlanoPage() {
  const sb = useMemo(() => createClient(), []);
  const [meals, setMeals] = useState<PlanMeal[]>([]);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [picker, setPicker] = useState<PlanMeal | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const p = await getPlan(sb);
    setMeals(p.meals);
    setItems(p.items);
    setLoaded(true);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  const macrosOf = (it: PlanItem) => scale(it.foods, Number(it.gramas));
  const totals = sum(items.map(macrosOf));

  async function addMeal(nome?: string) {
    const n = nome ?? prompt("Nome da refeição")?.trim();
    if (!n) return;
    const userId = await getUserId(sb);
    await sb.from("plan_meals").insert({ user_id: userId, nome: n, posicao: meals.length });
    load();
  }

  async function createDefaults() {
    const userId = await getUserId(sb);
    await sb.from("plan_meals").insert(DEFAULT_MEALS.map((nome, i) => ({ user_id: userId, nome, posicao: i })));
    load();
  }

  async function renameMeal(m: PlanMeal) {
    const nome = prompt("Novo nome", m.nome)?.trim();
    if (!nome) return;
    await sb.from("plan_meals").update({ nome }).eq("id", m.id);
    load();
  }

  async function deleteMeal(m: PlanMeal) {
    if (!confirm(`Apagar "${m.nome}" e os seus alimentos do plano?`)) return;
    await sb.from("plan_meals").delete().eq("id", m.id);
    load();
  }

  async function move(m: PlanMeal, dir: -1 | 1) {
    const idx = meals.findIndex((x) => x.id === m.id);
    const other = meals[idx + dir];
    if (!other) return;
    await Promise.all([
      sb.from("plan_meals").update({ posicao: other.posicao }).eq("id", m.id),
      sb.from("plan_meals").update({ posicao: m.posicao }).eq("id", other.id),
    ]);
    load();
  }

  async function editGrams(it: PlanItem) {
    const v = prompt(`Quantidade de ${it.foods.name} (g)`, String(it.gramas));
    const g = Number((v ?? "").replace(",", "."));
    if (!v || !(g > 0)) return;
    await sb.from("plan_items").update({ gramas: g }).eq("id", it.id);
    load();
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Plano base</h1>
        <p className="text-sm text-muted">
          O modelo do seu dia. Cada dia novo começa como cópia deste plano; depois é só ajustar o que mudou.
        </p>
      </header>

      <DaySummary totals={totals} />

      {loaded && meals.length === 0 && (
        <div className="rounded-xl border border-line bg-card p-4 text-sm">
          Plano vazio.{" "}
          <button className="text-accent" onClick={createDefaults}>
            Criar refeições padrão ({DEFAULT_MEALS.join(", ")})
          </button>
        </div>
      )}

      {meals.map((m, i) => {
        const its = items.filter((it) => it.plan_meal_id === m.id);
        const t = sum(its.map(macrosOf));
        return (
          <section key={m.id} className="rounded-2xl border border-line bg-card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <button className="font-medium" onClick={() => renameMeal(m)}>
                {m.nome}
              </button>
              <span className="tabular ml-auto text-xs text-muted">{t.kcal} kcal · P {Math.round(t.protein)}</span>
              <button className="px-1 text-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(m, -1)} aria-label="Subir">
                ↑
              </button>
              <button className="px-1 text-muted disabled:opacity-30" disabled={i === meals.length - 1} onClick={() => move(m, 1)} aria-label="Descer">
                ↓
              </button>
              <button className="px-1 text-muted hover:text-bad" onClick={() => deleteMeal(m)} aria-label="Apagar refeição">
                ✕
              </button>
            </div>
            <ul className="divide-y divide-line">
              {its.map((it) => {
                const mm = macrosOf(it);
                return (
                  <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button className="min-w-0 flex-1 text-left" onClick={() => editGrams(it)}>
                      <div className="truncate text-sm">{it.foods.name}</div>
                      <div className="tabular text-xs text-muted">{Number(it.gramas)} g</div>
                    </button>
                    <div className="tabular text-right text-sm">
                      {Math.round(mm.kcal)}
                      <div className="text-xs text-muted">P {Math.round(mm.protein)}</div>
                    </div>
                    <button
                      className="px-1 text-muted hover:text-bad"
                      onClick={async () => {
                        await sb.from("plan_items").delete().eq("id", it.id);
                        load();
                      }}
                      aria-label="Remover"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
            <button className="w-full px-4 py-2.5 text-left text-sm text-accent" onClick={() => setPicker(m)}>
              + Adicionar alimento
            </button>
          </section>
        );
      })}

      <button className="w-full rounded-2xl border border-dashed border-line py-3 text-sm text-muted" onClick={() => addMeal()}>
        + Nova refeição
      </button>

      {picker && (
        <FoodPicker
          title={`Adicionar a ${picker.nome}`}
          onClose={() => setPicker(null)}
          onPick={async (food, grams) => {
            const userId = await getUserId(sb);
            await sb.from("plan_items").insert({
              user_id: userId,
              plan_meal_id: picker.id,
              food_id: food.id,
              gramas: grams,
              posicao: items.filter((x) => x.plan_meal_id === picker.id).length,
            });
            await load();
          }}
        />
      )}
    </div>
  );
}
