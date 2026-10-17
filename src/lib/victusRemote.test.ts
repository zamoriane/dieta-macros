import { test } from "node:test";
import assert from "node:assert/strict";
import { validStartToken, validSlots, dueSlot, localClock, liveStartPayload } from "./victusRemote.ts";
const now = Date.parse("2026-10-17T10:00:00Z");
const slot = { day: "2026-10-17", at: "2026-10-17T10:00:00Z", expires: "2026-10-17T18:00:00Z" };
test("remote registration bounds tokens, schedule horizon, duration and duplicate days", () => {
  assert.equal(validStartToken("a".repeat(64)), true);
  for (const s of ["a".repeat(63), "a".repeat(1026), "zz".repeat(32), null]) assert.equal(validStartToken(s), false);
  assert.equal(validSlots([slot], now), true);
  assert.equal(validSlots([slot, slot], now), false);
  assert.equal(validSlots([{ ...slot, at: "bad" }], now), false);
  assert.equal(validSlots([{ ...slot, expires: "2026-10-17T18:01:00Z" }], now), false);
  assert.equal(validSlots([{ ...slot, expires: slot.at }], now), false);
  assert.equal(validSlots([slot], now - 4 * 86400_000), false);
});
test("dispatch skips future and missed reminders instead of flooding on restart", () => {
  assert.deepEqual(dueSlot([slot], now + 120_000), slot);
  assert.equal(dueSlot([slot], now - 1), undefined);
  assert.equal(dueSlot([slot], now + 300_000), undefined);
});
test("reminder windows use phone timezone across dates and DST", () => {
  assert.deepEqual(localClock(new Date("2026-10-17T01:00:00Z"), "America/Sao_Paulo"), { day: "2026-10-16", minute: 1320, weekday: 5 });
  assert.equal(localClock(new Date("2026-10-25T01:30:00Z"), "Europe/Lisbon").minute, 90);
});
test("APNs payload matches Swift Codable dates and contains no hydration history", () => {
  const p = liveStartPayload({ owner: "account", slot, now, en: false, goal: 2000 });
  assert.equal(p.aps.event, "start");
  assert.equal(p.aps["attributes-type"], "VictusAttributes");
  assert.equal(p.aps.attributes.expires + 978307200, Date.parse(slot.expires) / 1000);
  assert.equal(p.aps["stale-date"], Date.parse(slot.expires) / 1000);
  assert.equal(p.aps["content-state"].consumed, 0);
  assert.deepEqual(p.aps["content-state"].cups, []);
  assert.match(p.aps.alert.body, /água/);
  assert.match(liveStartPayload({ owner: "a", slot, now, en: true, goal: 2000 }).aps.alert.body, /water/);
});
