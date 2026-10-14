import { test } from "node:test";
import assert from "node:assert/strict";
import { lastValue, navyBodyFat, waistToHeight, whtrLevel } from "./body.ts";

test("relação cintura/altura e níveis NICE", () => {
  assert.equal(waistToHeight(95, 178), 0.53);
  assert.equal(whtrLevel(0.45), "saudavel");
  assert.equal(whtrLevel(0.53), "aumentado");
  assert.equal(whtrLevel(0.62), "alto");
  assert.equal(waistToHeight(0, 178), null);
});

test("gordura pela fórmula da Marinha", () => {
  const m = navyBodyFat("M", 178, 95, 40)!;
  assert.ok(Math.abs(m - 22.2) < 0.3, `homem ${m}`);
  const f = navyBodyFat("F", 165, 80, 33, 100)!;
  assert.ok(f > 25 && f < 40, `mulher ${f}`);
  assert.equal(navyBodyFat("F", 165, 80, 33), null); // sem anca
  assert.equal(navyBodyFat("M", 178, 38, 40), null); // cintura menor que pescoço
});

test("lastValue ignora dias sem essa medida", () => {
  const rows = [
    { dia: "2026-10-01", cintura: 96, pescoco: 40 },
    { dia: "2026-10-10", cintura: 94 },
  ];
  assert.deepEqual(lastValue(rows, "cintura"), { dia: "2026-10-10", v: 94 });
  assert.deepEqual(lastValue(rows, "pescoco"), { dia: "2026-10-01", v: 40 });
  assert.equal(lastValue(rows, "anca"), null);
});
