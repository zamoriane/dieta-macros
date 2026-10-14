// Medidas corporais: relação cintura/altura e percentagem de gordura estimada.

export type Sex = "M" | "F";
export const MEASURES = ["cintura", "anca", "pescoco", "peito", "braco", "coxa"] as const;
export type MeasureKey = (typeof MEASURES)[number];
export type Measurement = { dia: string } & Partial<Record<MeasureKey, number | null>> & { notas?: string | null };

/** Relação cintura/altura (NICE 2022: abaixo de 0,5 é saudável; 0,5–0,59 risco aumentado; ≥ 0,6 risco alto). */
export function waistToHeight(waistCm: number, heightCm: number): number | null {
  if (!(waistCm > 0 && heightCm > 0)) return null;
  return Math.round((waistCm / heightCm) * 100) / 100;
}

export type WhtrLevel = "saudavel" | "aumentado" | "alto";
export function whtrLevel(r: number): WhtrLevel {
  return r < 0.5 ? "saudavel" : r < 0.6 ? "aumentado" : "alto";
}

/**
 * Gordura corporal pela fórmula da Marinha dos EUA (Hodgdon & Beckett), em cm.
 * Homens: cintura e pescoço; mulheres: cintura, anca e pescoço. Estimativa com erro típico de alguns pontos.
 */
export function navyBodyFat(sex: Sex, heightCm: number, waistCm: number, neckCm: number, hipCm?: number | null): number | null {
  if (!(heightCm > 0 && waistCm > 0 && neckCm > 0)) return null;
  let pct: number;
  if (sex === "M") {
    if (waistCm - neckCm <= 0) return null;
    pct = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (!hipCm || waistCm + hipCm - neckCm <= 0) return null;
    pct = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
  }
  if (!Number.isFinite(pct) || pct < 2 || pct > 70) return null;
  return Math.round(pct * 10) / 10;
}

/** Último valor registado de uma medida até à data (as linhas podem ter só algumas medidas). */
export function lastValue(rows: Measurement[], key: MeasureKey, until?: string): { dia: string; v: number } | null {
  const sorted = [...rows].filter((r) => !until || r.dia <= until).sort((a, b) => (a.dia < b.dia ? 1 : -1));
  for (const r of sorted) {
    const v = r[key];
    if (v != null) return { dia: r.dia, v: Number(v) };
  }
  return null;
}
