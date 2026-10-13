import { test } from "node:test";
import assert from "node:assert/strict";
import { scale, sum, bmrMifflin, energyBalance, dailyTargets, ageOn, adaptiveTdee, buildAlerts } from "./nutrition.ts";

const aveia = { kcal_100g: 389, protein_100g: 16.9, carbs_100g: 66.3, fat_100g: 6.9, fiber_100g: 10.6 };

test("escala por gramas", () => {
  assert.deepEqual(scale(aveia, 30), { kcal: 116.7, protein: 5.1, carbs: 19.9, fat: 2.1, fiber: 3.2 });
  assert.equal(scale(aveia, 50).kcal, 194.5);
});

test("soma de itens", () => {
  const t = sum([scale(aveia, 30), scale(aveia, 50)]);
  assert.equal(t.kcal, 311);
  assert.equal(t.protein, 13.6); // 5.1 + 8.5 (arredondados por item)
});

test("Mifflin-St Jeor", () => {
  // Homem, 90 kg, 178 cm, 43 anos: 900 + 1112.5 - 215 + 5 = 1802.5
  assert.equal(bmrMifflin("M", 90, 178, 43), 1803);
  assert.equal(bmrMifflin("F", 70, 165, 40), 1370);
});

test("idade", () => {
  assert.equal(ageOn("1983-10-14", new Date("2026-10-13T12:00:00")), 42);
  assert.equal(ageOn("1983-10-13", new Date("2026-10-13T12:00:00")), 43);
});

test("balanço com Oura não soma o total_calories à TMB", () => {
  const b = energyBalance({ bmr: 1800, intakeKcal: 1900, ouraActiveKcal: 600, ouraTotalKcal: 2600, activityCorrection: 0.85, manualActivityFactor: 1.3 });
  assert.equal(b.activity, 510);
  assert.equal(b.expenditure, 2310);
  assert.equal(b.deficit, 410);
  assert.equal(b.source, "oura");
});

test("balanço sem Oura usa fator manual", () => {
  const b = energyBalance({ bmr: 1800, intakeKcal: 1800, activityCorrection: 0.85, manualActivityFactor: 1.3 });
  assert.equal(b.activity, 540);
  assert.equal(b.deficit, 540);
  assert.equal(b.source, "estimativa");
});

test("metas respeitam o mínimo e fecham os macros", () => {
  const t = dailyTargets({ expenditure: 2400, deficit: 500, weightKg: 90, proteinPerKg: 1.8, fatPct: 25, minKcal: 1500 });
  assert.deepEqual(t, { kcal: 1900, protein: 162, fat: 53, carbs: 194 });
  assert.equal(dailyTargets({ expenditure: 1700, deficit: 500, weightKg: 60, proteinPerKg: 1.6, fatPct: 25, minKcal: 1500 }).kcal, 1500);
});

test("TDEE adaptativo", () => {
  // 21 dias a 2000 kcal, peso a cair 0,05 kg/dia ≈ 385 kcal/dia de défice → TDEE ≈ 2385 (EMA atenua)
  const days = Array.from({ length: 21 }, (_, i) => ({ intake: 2000, weight: 90 - 0.05 * i }));
  const tdee = adaptiveTdee(days)!;
  assert.ok(tdee > 2150 && tdee < 2400, String(tdee));
  assert.equal(adaptiveTdee(days.slice(0, 10)), null);
});

test("alertas", () => {
  const alerts = buildAlerts({
    totals: { kcal: 900, protein: 60, carbs: 80, fat: 30, fiber: 10 },
    targets: { kcal: 1900, protein: 160, fat: 53, carbs: 194 },
    balance: energyBalance({ bmr: 1800, intakeKcal: 900, activityCorrection: 0.85, manualActivityFactor: 1.3 }),
    hour: 19, isToday: true, lowIntakeStreak: 3, minKcal: 1500, hasWeightLast7d: false, sleepScore: 62,
  });
  assert.equal(alerts.length, 4);
});

import { waterReference } from "./nutrition.ts";

test("referência de água", () => {
  // Homem, gasto 2628 kcal, 75 min de treino: máx(2,5; 2,63) + 0,625 ≈ 3,3 L total; 2,6 L bebidas
  const w = waterReference({ sex: "M", expenditureKcal: 2628, exerciseMin: 75 });
  assert.equal(w.total, 3.3);
  assert.equal(w.drinks, 2.6);
  // Sem gasto conhecido: mínimo EFSA
  assert.deepEqual(waterReference({ sex: "F" }).total, 2.0);
});
