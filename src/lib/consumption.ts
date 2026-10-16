// Planeado vs consumido no diário alimentar (funções puras, testáveis).
import { sum, type Macros } from "./nutrition.ts";

export type ItemState = "planeado" | "consumido" | "nao_comido" | "legado";

type Item = Partial<Macros> & { estado?: ItemState | null; gramas_plano?: number | null };

/** Estado de um item; sem a coluna (antes da migração 0012) tudo contava como consumido. */
export function itemState(it: { estado?: ItemState | null }): ItemState {
  return it.estado ?? "consumido";
}
export const isConsumed = (it: { estado?: ItemState | null }) => itemState(it) === "consumido";
export const isPending = (it: { estado?: ItemState | null }) => {
  const s = itemState(it);
  return s === "planeado" || s === "legado";
};

/** Totais do dia: só o consumido conta como ingerido; o planeado e o pendente vêm à parte. */
export function dayTotals(items: Item[]) {
  return {
    consumed: sum(items.filter(isConsumed)),
    planned: sum(items.filter((i) => i.gramas_plano != null)),
    pending: sum(items.filter(isPending)),
    nConsumed: items.filter(isConsumed).length,
    nPending: items.filter(isPending).length,
  };
}

export type DayStatus = "sem_registo" | "parcial" | "completo";

/**
 * Estado do registo de um dia:
 * - sem registo: nada confirmado como consumido (nunca é "zero confirmado");
 * - completo: marcado pelo utilizador, ou dia já passado em que tudo o que estava planeado
 *   foi confirmado ou marcado como não comido;
 * - parcial: o resto (há consumo confirmado mas ainda há itens por confirmar, ou é hoje).
 */
export function dayStatus(d: { nConsumed: number; nPending: number; completo?: boolean | null; isPast: boolean }): DayStatus {
  if (d.nConsumed === 0 && !d.completo) return "sem_registo";
  if (d.completo) return "completo";
  if (d.isPast && d.nPending === 0) return "completo";
  return "parcial";
}

/** Linha da vista daily_totals (migração 0012), com compatibilidade com a vista antiga. */
export type DailyTotalsRow = {
  dia: string;
  kcal: number | string;
  protein?: number | string;
  carbs?: number | string;
  fat?: number | string;
  fiber?: number | string;
  completo?: boolean | null;
  kcal_plano?: number | string | null;
  kcal_pendente?: number | string | null;
  n_consumidos?: number | string | null;
  n_planeados?: number | string | null;
  n_legado?: number | string | null;
  n_plano?: number | string | null;
  n_plano_comidos?: number | string | null;
};

export function rowStatus(r: DailyTotalsRow, today: string): DayStatus {
  // vista antiga (sem n_consumidos): um dia com linha tinha itens → tratava-se como registado
  const nConsumed = r.n_consumidos == null ? (Number(r.kcal) > 0 ? 1 : 0) : Number(r.n_consumidos);
  const nPending = Number(r.n_planeados ?? 0) + Number(r.n_legado ?? 0);
  return dayStatus({ nConsumed, nPending, completo: r.completo, isPast: r.dia < today });
}

export function rowMacros(r: DailyTotalsRow): Macros {
  return { kcal: Number(r.kcal), protein: Number(r.protein ?? 0), carbs: Number(r.carbs ?? 0), fat: Number(r.fat ?? 0), fiber: Number(r.fiber ?? 0) };
}

/**
 * Itens a atualizar para confirmar (ou desfazer) uma refeição inteira.
 * Desfazer só devolve ao estado "planeado" o que veio do plano; os extras ficam (apagam-se à parte).
 */
export function mealConfirmTargets(items: { id: number; estado?: ItemState | null; gramas_plano?: number | null }[], confirm: boolean): number[] {
  return items.filter((i) => (confirm ? isPending(i) : isConsumed(i) && i.gramas_plano != null)).map((i) => i.id);
}
