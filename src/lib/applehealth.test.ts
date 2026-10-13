import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHealthAutoExport } from "./applehealth.ts";

const payload = {
  data: {
    metrics: [
      {
        name: "active_energy",
        units: "kcal",
        data: [
          { date: "2026-10-12 00:00:00 +0100", qty: 612.4, source: "Apple Watch" },
          { date: "2026-10-13 00:00:00 +0100", qty: 300 },
        ],
      },
      { name: "basal_energy_burned", units: "kJ", data: [{ date: "2026-10-12 00:00:00 +0100", qty: 8368 }] },
      { name: "step_count", units: "count", data: [{ date: "2026-10-12 10:00:00 +0100", qty: 4000 }, { date: "2026-10-12 18:00:00 +0100", qty: 2500.4 }] },
      { name: "weight_body_mass", units: "kg", data: [{ date: "2026-10-12 07:10:00 +0100", qty: 107.3 }] },
      { name: "resting_heart_rate", units: "count/min", data: [{ date: "2026-10-12 00:00:00 +0100", qty: 60 }, { date: "2026-10-12 12:00:00 +0100", qty: 62 }] },
      { name: "sleep_analysis", units: "hr", data: [{ date: "2026-10-12 00:00:00 +0100", totalSleep: 6.5, deep: 1, rem: 1.4 }] },
    ],
    workouts: [
      {
        name: "Outdoor Walk",
        start: "2026-10-12 18:00:00 +0100",
        end: "2026-10-12 18:45:00 +0100",
        duration: 2700,
        activeEnergyBurned: { qty: 210.6, units: "kcal" },
      },
    ],
  },
};

test("agrega métricas por dia", () => {
  const r = parseHealthAutoExport(payload);
  assert.equal(r.days.length, 2);
  const d12 = r.days[0];
  assert.equal(d12.dia, "2026-10-12");
  assert.equal(d12.active_kcal, 612);
  assert.equal(d12.basal_kcal, 2000); // 8368 kJ
  assert.equal(d12.steps, 6500);
  assert.equal(d12.weight_kg, 107.3);
  assert.equal(d12.resting_hr, 61);
  assert.equal(d12.sleep_min, 390);
  assert.equal(d12.workouts?.length, 1);
  assert.equal(d12.workouts![0].name, "Outdoor Walk");
  assert.equal(d12.workouts![0].min, 45);
  assert.equal(d12.workouts![0].kcal, 211);
  assert.equal(d12.workouts![0].route, undefined);
  assert.equal(r.days[1].active_kcal, 300);
  assert.equal(r.workouts, 1);
});

test("payload vazio ou estranho não rebenta", () => {
  assert.deepEqual(parseHealthAutoExport({}).days, []);
  assert.deepEqual(parseHealthAutoExport(null).days, []);
  assert.deepEqual(parseHealthAutoExport({ data: { metrics: "x" } }).days, []);
});

import { parseWorkout, simplify, routeKm } from "./applehealth.ts";

test("treino com rota GPS (formato real da Health Auto Export)", () => {
  // Linha reta ~1 km para norte com ruído mínimo + 1 ponto impreciso que deve ser descartado
  const route = Array.from({ length: 101 }, (_, i) => ({
    latitude: 38.68 + i * 0.00009,
    longitude: -9.32 + (i % 2 ? 0.000001 : 0),
    horizontalAccuracy: 10,
    timestamp: "2026-10-13 12:00:00 +0100",
  }));
  route.splice(50, 0, { latitude: 39, longitude: -9, horizontalAccuracy: 120, timestamp: "x" });
  const w = parseWorkout({
    duration: 2580,
    start: "2026-10-12 08:39:00 +0100",
    activities: [
      {
        id: "ABC",
        activityType: "walking",
        metrics: { activeEnergy: { qty: 212.4, units: "kcal" }, heartRateAverage: { qty: 104.2 }, heartRateMaximum: { qty: 118 } },
      },
    ],
    maxHeartRate: { qty: 118, units: "count/min" },
    route,
  });
  assert.equal(w.name, "Walking");
  assert.equal(w.id, "ABC");
  assert.equal(w.min, 43);
  assert.equal(w.kcal, 212);
  assert.equal(w.avg_hr, 104);
  assert.equal(w.max_hr, 118);
  assert.ok(w.km! > 0.95 && w.km! < 1.05, String(w.km));
  assert.ok(w.route!.length >= 2 && w.route!.length < 10, String(w.route!.length)); // linha reta simplifica muito
});

test("simplificação mantém extremos e forma", () => {
  const pts: [number, number][] = [[0, 0], [0, 0.0001], [0, 0.0002], [0.001, 0.0003], [0, 0.0004]];
  const s = simplify(pts);
  assert.deepEqual(s[0], [0, 0]);
  assert.deepEqual(s[s.length - 1], [0, 0.0004]);
  assert.ok(s.some((p) => p[0] === 0.001));
  assert.ok(routeKm([[0, 0], [0, 1]]) > 111 && routeKm([[0, 0], [0, 1]]) < 112);
});
