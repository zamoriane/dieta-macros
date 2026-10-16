// Água: tipos de bebida, configuração, metas e agenda de lembretes (funções puras, testáveis).

/**
 * Bebidas e "fator de hidratação" (quanto do volume conta como água).
 * Valores conservadores, inspirados nas apps de água: o Beverage Hydration Index
 * (Maughan et al., 2016) mostra que café, chá, leite e sumos hidratam quase como a água
 * em quantidades moderadas; o álcool conta pouco.
 */
export const DRINKS = {
  agua: { fator: 1, pt: "Água", en: "Water" },
  agua_gas: { fator: 1, pt: "Água com gás", en: "Sparkling water" },
  cha: { fator: 0.9, pt: "Chá / infusão", en: "Tea / infusion" },
  cafe: { fator: 0.8, pt: "Café", en: "Coffee" },
  leite: { fator: 0.9, pt: "Leite / bebida vegetal", en: "Milk / plant milk" },
  sumo: { fator: 0.9, pt: "Sumo", en: "Juice" },
  isotonica: { fator: 1, pt: "Bebida isotónica", en: "Sports drink" },
  refrigerante: { fator: 0.9, pt: "Refrigerante", en: "Soft drink" },
  sopa: { fator: 0.9, pt: "Sopa", en: "Soup" },
  cerveja: { fator: 0.5, pt: "Cerveja", en: "Beer" },
} as const;

export type DrinkId = keyof typeof DRINKS;
export const DRINK_IDS = Object.keys(DRINKS) as DrinkId[];

export function drinkName(id: string, locale: "pt" | "en"): string {
  const d = DRINKS[id as DrinkId];
  return d ? d[locale] : id;
}
export function drinkFactor(id: string): number {
  return DRINKS[id as DrinkId]?.fator ?? 1;
}

/** Volume que conta como água. */
export function effectiveMl(ml: number, fator: number): number {
  return Math.round(ml * fator);
}

export type Cup = { ml: number; bebida: DrinkId };
export type Reminders = {
  ativo: boolean;
  intervalo: number; // minutos
  inicio: string; // "HH:MM"
  fim: string; // "HH:MM"
  dias: number[]; // 0 = domingo … 6 = sábado (Date.getDay)
  texto: string; // vazio = texto por omissão
};
export type WaterConfig = { meta_ml: number | null; copos: Cup[]; lembretes: Reminders };

export const DEFAULT_CUPS: Cup[] = [
  { ml: 250, bebida: "agua" },
  { ml: 500, bebida: "agua" },
  { ml: 200, bebida: "cha" },
];
export const DEFAULT_REMINDERS: Reminders = { ativo: false, intervalo: 90, inicio: "09:00", fim: "21:00", dias: [0, 1, 2, 3, 4, 5, 6], texto: "" };
export const INTERVALS = [30, 45, 60, 90, 120, 180];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lê a configuração gravada no perfil, corrigindo valores em falta ou inválidos. */
export function parseConfig(raw: unknown): WaterConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const meta = Number(o.meta_ml);
  const copos = Array.isArray(o.copos)
    ? (o.copos as unknown[])
        .map((c) => c as Record<string, unknown>)
        .filter((c) => c && Number(c.ml) >= 10 && Number(c.ml) <= 3000 && typeof c.bebida === "string" && c.bebida in DRINKS)
        .slice(0, 6)
        .map((c) => ({ ml: Math.round(Number(c.ml)), bebida: c.bebida as DrinkId }))
    : [];
  const r = (o.lembretes && typeof o.lembretes === "object" ? o.lembretes : {}) as Record<string, unknown>;
  const dias = Array.isArray(r.dias) ? [...new Set((r.dias as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : null;
  const intervalo = Number(r.intervalo);
  return {
    meta_ml: meta >= 500 && meta <= 8000 ? Math.round(meta) : null,
    copos: copos.length ? copos : DEFAULT_CUPS,
    lembretes: {
      ativo: r.ativo === true,
      intervalo: intervalo >= 15 && intervalo <= 360 ? Math.round(intervalo) : DEFAULT_REMINDERS.intervalo,
      inicio: typeof r.inicio === "string" && HHMM.test(r.inicio) ? r.inicio : DEFAULT_REMINDERS.inicio,
      fim: typeof r.fim === "string" && HHMM.test(r.fim) ? r.fim : DEFAULT_REMINDERS.fim,
      dias: dias ?? DEFAULT_REMINDERS.dias,
      texto: typeof r.texto === "string" ? r.texto.slice(0, 80) : "",
    },
  };
}

/** Meta de bebidas do dia (mL): a manual, se definida; senão a referência calculada (L de bebidas). */
export function goalMl(cfg: WaterConfig, autoDrinksL: number | null | undefined): number {
  if (cfg.meta_ml) return cfg.meta_ml;
  return autoDrinksL ? Math.round(autoDrinksL * 1000) : 2000;
}

function at(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Próximos lembretes (hora local do telemóvel), no máximo `max`, para hoje e os próximos dias.
 * Inteligente: hoje não lembra se a meta já foi atingida e só volta a lembrar um intervalo
 * depois da última bebida registada.
 */
export function reminderTimes(opts: {
  cfg: Reminders;
  now: Date;
  lastDrinkAt: Date | null;
  consumedMl: number;
  goalMl: number;
  days?: number;
  max?: number;
}): Date[] {
  const { cfg, now } = opts;
  if (!cfg.ativo || !cfg.dias.length) return [];
  const step = cfg.intervalo * 60_000;
  const out: Date[] = [];
  const max = opts.max ?? 48;
  for (let d = 0; d < (opts.days ?? 3) && out.length < max; d++) {
    const day = new Date(now);
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() + d);
    if (!cfg.dias.includes(day.getDay())) continue;
    const start = at(day, cfg.inicio);
    const end = at(day, cfg.fim);
    if (end <= start) continue;
    let t = start.getTime();
    if (d === 0) {
      if (opts.consumedMl >= opts.goalMl) continue;
      const afterDrink = opts.lastDrinkAt ? opts.lastDrinkAt.getTime() + step : 0;
      const afterNow = now.getTime() + 60_000;
      // sem bebida registada hoje: segue a grelha a partir do início; com bebida: um intervalo depois dela
      while (t < afterNow) t += step;
      if (afterDrink > t) t = Math.ceil(afterDrink / 60_000) * 60_000;
    }
    for (; t <= end.getTime() && out.length < max; t += step) out.push(new Date(t));
  }
  return out;
}
