import { test } from "node:test";
import assert from "node:assert/strict";
import { victusMood, validVictusEvent } from "./victus.ts";

test("Victus respects time, rest days, progress and completion without rewarding excess", () => {
  assert.equal(victusMood(0, 2000, 540), "sleepy");
  assert.equal(victusMood(0, 2000, 569), "sleepy");
  assert.equal(victusMood(500, 2000, 900), "grumpy");
  assert.equal(victusMood(1100, 2000, 900), "encouraging");
  assert.equal(victusMood(1500, 2000, 1200), "encouraging");
  assert.equal(victusMood(2000, 2000, 540), "happy");
  assert.equal(victusMood(4000, 2000, 1200), "happy");
  assert.equal(victusMood(0, 2000, 1200, 540, 1260, false), "sleepy");
  assert.equal(victusMood(0, 0, 1200), "sleepy");
});
test("outbox accepts valid events but rejects wrong owners, invalid dates, UUIDs and volumes", () => {
  const e = { id: "f0a71136-1647-4459-a1d0-299179654193", owner: "alice", day: "2026-10-16", at: "2026-10-16T12:30:00Z", ml: 200, bebida: "cha", fator: 0.9 };
  assert.equal(validVictusEvent(e, "alice"), true);
  assert.equal(validVictusEvent(e, "bob"), false);
  for (const edit of [{ ml: 0 }, { ml: 3001 }, { ml: 1.5 }, { at: "invalid" }, { id: "invalid" }, { fator: NaN }]) {
    assert.equal(validVictusEvent({ ...e, ...edit }, "alice"), false);
  }
});
