import { test } from "node:test";
import assert from "node:assert/strict";
import { dayStatus, dayTotals, mealConfirmTargets, rowStatus } from "./consumption.ts";

const item = (id: number, kcal: number, estado: "planeado" | "consumido" | "nao_comido" | "legado" | undefined, plano = true) => ({
  id,
  kcal,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  estado,
  gramas_plano: plano ? 100 : null,
});

test("abrir um dia novo (plano copiado) não aumenta o consumido", () => {
  const t = dayTotals([item(1, 300, "planeado"), item(2, 500, "planeado")]);
  assert.equal(t.consumed.kcal, 0);
  assert.equal(t.planned.kcal, 800);
  assert.equal(t.pending.kcal, 800);
});

test("confirmar conta uma vez; não comido e legado não contam; extra conta", () => {
  const t = dayTotals([item(1, 300, "consumido"), item(2, 500, "nao_comido"), item(3, 200, "legado"), item(4, 90, "consumido", false)]);
  assert.equal(t.consumed.kcal, 390);
  assert.equal(t.planned.kcal, 1000);
  assert.equal(t.pending.kcal, 200);
  assert.equal(t.nConsumed, 2);
});

test("compatibilidade: sem coluna estado tudo conta como antes", () => {
  assert.equal(dayTotals([item(1, 300, undefined)]).consumed.kcal, 300);
});

test("confirmar e desfazer uma refeição", () => {
  const meal = [item(1, 300, "planeado"), item(2, 100, "legado"), item(3, 50, "consumido", false), item(4, 70, "nao_comido")];
  assert.deepEqual(mealConfirmTargets(meal, true), [1, 2]);
  const after = meal.map((i) => (i.id === 1 || i.id === 2 ? { ...i, estado: "consumido" as const } : i));
  assert.deepEqual(mealConfirmTargets(after, false), [1, 2]); // o extra (3) não volta a planeado
});

test("estado do dia: sem registo, parcial e completo", () => {
  assert.equal(dayStatus({ nConsumed: 0, nPending: 4, isPast: true }), "sem_registo");
  assert.equal(dayStatus({ nConsumed: 0, nPending: 0, isPast: true }), "sem_registo");
  assert.equal(dayStatus({ nConsumed: 2, nPending: 1, isPast: true }), "parcial");
  assert.equal(dayStatus({ nConsumed: 2, nPending: 0, isPast: false }), "parcial");
  assert.equal(dayStatus({ nConsumed: 2, nPending: 0, isPast: true }), "completo");
  assert.equal(dayStatus({ nConsumed: 2, nPending: 3, completo: true, isPast: false }), "completo");
});

test("linhas da vista: nova e antiga", () => {
  assert.equal(rowStatus({ dia: "2026-10-01", kcal: 0, n_consumidos: 0, n_legado: 5 }, "2026-10-17"), "sem_registo");
  assert.equal(rowStatus({ dia: "2026-10-01", kcal: 1500, n_consumidos: 6, n_planeados: 0, n_legado: 0 }, "2026-10-17"), "completo");
  assert.equal(rowStatus({ dia: "2026-10-01", kcal: 1500 }, "2026-10-17"), "completo"); // vista antiga
});
