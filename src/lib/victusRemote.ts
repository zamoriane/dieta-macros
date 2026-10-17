export type LiveSlot = { day: string; at: string; expires: string };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validStartToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64,1024}$/i.test(value) && value.length % 2 === 0;
}
export function validSlots(value: unknown, now: number): value is LiveSlot[] {
  if (!Array.isArray(value) || value.length > 3) return false;
  const days = new Set<string>();
  return value.every(s => {
    if (!s || typeof s.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.day) || days.has(s.day)) return false;
    days.add(s.day);
    const at = Date.parse(s.at), end = Date.parse(s.expires);
    return Number.isFinite(at) && Number.isFinite(end) && at >= now - 60_000 && at <= now + 3 * 86400_000 && end > at && end <= at + 8 * 3600_000;
  });
}
export function dueSlot(slots: LiveSlot[], now: number): LiveSlot | undefined {
  // Do not replay hours of missed reminders after scheduler downtime.
  return slots.find(s => Date.parse(s.at) <= now && Date.parse(s.at) > now - 5 * 60_000 && Date.parse(s.expires) > now);
}
export function localClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return { day, minute: Number(p.hour) * 60 + Number(p.minute), weekday: new Date(day + "T12:00:00Z").getUTCDay() };
}
export function liveStartPayload(o: { owner: string; slot: LiveSlot; now: number; en: boolean; goal: number }) {
  return { aps: {
    timestamp: Math.floor(o.now / 1000), event: "start", "attributes-type": "VictusAttributes",
    // Swift's default Codable Date is seconds since 2001-01-01, not Unix time.
    attributes: { owner: o.owner, day: o.slot.day, expires: Date.parse(o.slot.expires) / 1000 - 978307200 },
    // No health progress is sent in the push. The extension reads its App Group.
    "content-state": { consumed: 0, goal: o.goal, mood: "encouraging", english: o.en, pending: 0, cups: [] },
    "stale-date": Math.floor(Date.parse(o.slot.expires) / 1000),
    alert: { title: "Victus", body: o.en ? "Time for a glass of water?" : "Está na hora de beber água?" },
  } };
}
