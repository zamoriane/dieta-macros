import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CUPS, effectiveMl, goalMl, parseConfig, reminderTimes } from "./water.ts";

const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const cfg = { ativo: true, intervalo: 60, inicio: "09:00", fim: "12:00", dias: [0, 1, 2, 3, 4, 5, 6], texto: "" };

test("configuração: valores por omissão e limpeza", () => {
  const c = parseConfig(null);
  assert.equal(c.meta_ml, null);
  assert.deepEqual(c.copos, DEFAULT_CUPS);
  assert.equal(c.lembretes.ativo, false);
  const d = parseConfig({ meta_ml: 2500, copos: [{ ml: 330, bebida: "agua" }, { ml: 5, bebida: "agua" }, { ml: 200, bebida: "vodka" }], lembretes: { ativo: true, intervalo: 5, inicio: "25:00", dias: [1, 1, 9] } });
  assert.equal(d.meta_ml, 2500);
  assert.deepEqual(d.copos, [{ ml: 330, bebida: "agua" }]);
  assert.equal(d.lembretes.intervalo, 90);
  assert.equal(d.lembretes.inicio, "09:00");
  assert.deepEqual(d.lembretes.dias, [1]);
});

test("meta e volume efetivo", () => {
  assert.equal(goalMl(parseConfig({}), 2.4), 2400);
  assert.equal(goalMl(parseConfig({ meta_ml: 3000 }), 2.4), 3000);
  assert.equal(effectiveMl(200, 0.8), 160);
});

test("lembretes: grelha de hoje a partir de agora e dias seguintes", () => {
  const now = new Date(2026, 9, 16, 9, 30);
  const r = reminderTimes({ cfg, now, lastDrinkAt: null, consumedMl: 0, goalMl: 2000, days: 2 });
  assert.deepEqual(r.map(hm), ["10:00", "11:00", "12:00", "09:00", "10:00", "11:00", "12:00"]);
  assert.equal(r[3].getDate(), 17);
});

test("lembretes: um intervalo depois da última bebida e nada hoje com a meta cumprida", () => {
  const now = new Date(2026, 9, 16, 9, 30);
  const after = reminderTimes({ cfg, now, lastDrinkAt: new Date(2026, 9, 16, 9, 25), consumedMl: 500, goalMl: 2000, days: 1 });
  assert.deepEqual(after.map(hm), ["10:25", "11:25"]);
  const done = reminderTimes({ cfg, now, lastDrinkAt: null, consumedMl: 2000, goalMl: 2000, days: 2 });
  assert.equal(done[0].getDate(), 17);
  const off = reminderTimes({ cfg: { ...cfg, dias: [] }, now, lastDrinkAt: null, consumedMl: 0, goalMl: 2000 });
  assert.equal(off.length, 0);
});
