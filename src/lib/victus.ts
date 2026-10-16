/** Shared presentation contract. Native widgets implement the same four-state rules. */
export type VictusMood = "sleepy" | "grumpy" | "encouraging" | "happy";
export function victusMood(consumed: number, goal: number, minute: number, start = 540, end = 1260, activeDay = true): VictusMood {
  if (!(goal > 0) || !Number.isFinite(consumed)) return "sleepy";
  const progress = Math.max(0, consumed / goal);
  if (progress >= 1) return "happy";
  if (progress >= 0.75) return "encouraging";
  if (!activeDay || minute < start + 30) return "sleepy";
  const expected = Math.max(0, Math.min(1, (minute - start) / Math.max(1, end - start)));
  return progress + 0.15 < expected ? "grumpy" : "encouraging";
}
export function clockMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export type VictusEvent = { id: string; owner: string; day: string; at: string; ml: number; bebida: string; fator: number };
export function validVictusEvent(e: VictusEvent, owner: string): boolean {
  return e.owner === owner && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e.id)
    && /^\d{4}-\d{2}-\d{2}$/.test(e.day) && Number.isFinite(Date.parse(e.at))
    && Number.isInteger(e.ml) && e.ml >= 10 && e.ml <= 3000
    && Number.isFinite(e.fator) && e.fator >= 0 && e.fator <= 1.5;
}
