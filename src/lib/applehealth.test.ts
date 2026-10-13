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
  assert.deepEqual(d12.workouts, [{ name: "Outdoor Walk", start: "2026-10-12 18:00:00 +0100", min: 45, kcal: 211 }]);
  assert.equal(r.days[1].active_kcal, 300);
  assert.equal(r.workouts, 1);
});

test("payload vazio ou estranho não rebenta", () => {
  assert.deepEqual(parseHealthAutoExport({}).days, []);
  assert.deepEqual(parseHealthAutoExport(null).days, []);
  assert.deepEqual(parseHealthAutoExport({ data: { metrics: "x" } }).days, []);
});
