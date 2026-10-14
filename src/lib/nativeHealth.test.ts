import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDays, mergeWorkouts, workoutName } from "./nativeHealth.ts";

test("buildDays agrega por dia local", () => {
  process.env.TZ = "Europe/Lisbon";
  const rows = buildDays({
    activeKcal: [{ startDate: "2026-10-13T00:00:00+01:00", endDate: "2026-10-14T00:00:00+01:00", value: 512.4 }],
    steps: [{ startDate: "2026-10-13T00:00:00+01:00", endDate: "2026-10-14T00:00:00+01:00", value: 9876 }],
    hrv: [{ startDate: "2026-10-13T00:00:00+01:00", endDate: "2026-10-14T00:00:00+01:00", value: 41.27 }],
    sleep: [
      { startDate: "2026-10-12T23:30:00+01:00", endDate: "2026-10-13T03:30:00+01:00", value: 0, sleepState: "deep" },
      { startDate: "2026-10-13T03:30:00+01:00", endDate: "2026-10-13T03:45:00+01:00", value: 0, sleepState: "awake" },
      { startDate: "2026-10-13T03:45:00+01:00", endDate: "2026-10-13T07:00:00+01:00", value: 0, sleepState: "rem" },
    ],
    weight: [
      { startDate: "2026-10-13T07:10:00+01:00", endDate: "2026-10-13T07:10:00+01:00", value: 99.4 },
      { startDate: "2026-10-13T20:00:00+01:00", endDate: "2026-10-13T20:00:00+01:00", value: 100.2 },
    ],
    workouts: [{ workoutType: "traditionalStrengthTraining", duration: 3540, totalEnergyBurned: 310.6, startDate: "2026-10-13T18:30:00+01:00", endDate: "2026-10-13T19:29:00+01:00", platformId: "A" }],
  });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.dia, "2026-10-13");
  assert.equal(r.active_kcal, 512);
  assert.equal(r.steps, 9876);
  assert.equal(r.hrv_ms, 41.3);
  assert.equal(r.sleep_min, 240 + 195);
  assert.equal(r.weight_kg, 100.2);
  assert.equal(r.workouts![0].name, "Traditional Strength Training");
  assert.equal(r.workouts![0].min, 59);
});

test("mergeWorkouts mantém o treino existente com GPS", () => {
  const existing = [{ id: "hae1", name: "Outdoor Walk", start: "2026-10-13T08:00:00+01:00", min: 40, kcal: 200, route: [[1, 2]] as [number, number][] }];
  const incoming = [
    { id: "N1", name: "Walking", start: "2026-10-13T08:01:00+01:00", min: 40, kcal: 190 },
    { id: "N2", name: "Cycling", start: "2026-10-13T18:00:00+01:00", min: 30, kcal: 250 },
  ];
  const m = mergeWorkouts(existing, incoming);
  assert.deepEqual(m.map((w) => w.id), ["hae1", "N2"]);
  assert.equal(workoutName("running"), "Running");
});
