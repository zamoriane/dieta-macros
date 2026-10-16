"use client";
import { useState } from "react";
import { type LogItem } from "@/lib/data";
import { dayTotals, isPending, itemState, type ItemState } from "@/lib/consumption";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n/client";

export function MealCard({
  name,
  items,
  onAdd,
  onEdit,
  onRemove,
  onRepeat,
  repeatCount = 0,
  defaultOpen = false,
  states = false,
  onConfirmMeal,
  onSetState,
}: {
  name: string;
  items: LogItem[];
  onAdd: () => void;
  onEdit: (it: LogItem) => void;
  onRemove: (it: LogItem) => void;
  onRepeat?: () => void;
  repeatCount?: number;
  defaultOpen?: boolean;
  /** diário com estados (migração 0012): mostra confirmar / por confirmar */
  states?: boolean;
  onConfirmMeal?: (confirm: boolean) => void;
  onSetState?: (it: LogItem, estado: ItemState) => void;
}) {
  const { t: tr, tp } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const dt = dayTotals(items);
  const t = dt.consumed; // o total da refeição é sempre o consumido
  const empty = items.length === 0;
  const pendingN = states ? items.filter(isPending).length : 0;
  const confirmedFromPlan = states && pendingN === 0 && items.some((i) => itemState(i) === "consumido" && i.gramas_plano != null);
  const id = `meal-${name.replace(/\W+/g, "-")}`;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 pr-2">
        <button
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-1 text-left hover:bg-card-2/60"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={id}
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              empty || pendingN > 0 ? "bg-card-2 text-muted" : "bg-accent-soft text-accent"
            }`}
            aria-hidden="true"
          >
            <Icon name={empty ? "plus" : pendingN > 0 ? "clock" : "check"} size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-snug">{name}</span>
            <span className="tabular block text-xs text-muted">
              {empty ? (
                tr("refeicao.vazia")
              ) : (
                <>
                  {pendingN > 0 ? tr("consumo.porConfirmarN", { n: pendingN, total: items.length }) : tp("refeicao.itens", items.length)} ·{" "}
                  {tr("macro.p")} {Math.round(t.protein)} g
                  <span className="hidden sm:inline">
                    {" "}
                    · {tr("macro.c")} {Math.round(t.carbs)} · {tr("macro.g")} {Math.round(t.fat)}
                  </span>
                </>
              )}
            </span>
          </span>
          <span className="tabular shrink-0 text-right">
            <span className="font-semibold">{t.kcal}</span>
            <span className="block text-[11px] text-muted">
              {states && dt.planned.kcal > 0 && dt.planned.kcal !== t.kcal ? tr("consumo.dePlaneado", { kcal: dt.planned.kcal }) : "kcal"}
            </span>
          </span>
          <Icon name="chevronDown" size={18} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <button className="icon-btn shrink-0 text-accent" onClick={onAdd} aria-label={tr("refeicao.adicionarA", { nome: name })}>
          <Icon name="plus" />
        </button>
      </div>

      {open && (
        <div id={id} className="border-t border-line">
          {empty ? (
            <div className="flex flex-wrap items-center gap-2 px-4 py-4">
              <button className="btn btn-primary" onClick={onAdd}>
                <Icon name="plus" size={18} /> {tr("refeicao.adicionarAlimento")}
              </button>
              {onRepeat && repeatCount > 0 && (
                <button className="btn btn-ghost" onClick={onRepeat}>
                  <Icon name="repeat" size={18} /> {tr("refeicao.repetirOntem", { n: repeatCount })}
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {states && (pendingN > 0 || confirmedFromPlan) && onConfirmMeal && (
                <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  {pendingN > 0 ? (
                    <button className="btn btn-primary !min-h-10" onClick={() => onConfirmMeal(true)}>
                      <Icon name="check" size={18} /> {tr("consumo.confirmarRefeicao")}
                    </button>
                  ) : (
                    <button className="btn btn-ghost !min-h-10 text-sm" onClick={() => onConfirmMeal(false)}>
                      {tr("consumo.desfazerConfirmacao")}
                    </button>
                  )}
                  {pendingN > 0 && <span className="text-xs text-muted">{tr("consumo.dicaConfirmar")}</span>}
                </li>
              )}
              {items.map((it) => (
                <FoodItemRow
                  key={it.id}
                  item={it}
                  onEdit={() => onEdit(it)}
                  onRemove={() => onRemove(it)}
                  onSetState={states && onSetState ? (st) => onSetState(it, st) : undefined}
                />
              ))}
              <li>
                <button className="flex min-h-12 w-full items-center gap-2 px-4 text-sm font-medium text-accent hover:bg-card-2/60" onClick={onAdd}>
                  <Icon name="plus" size={18} /> {tr("refeicao.adicionarAlimento")}
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function FoodItemRow({
  item,
  onEdit,
  onRemove,
  onSetState,
}: {
  item: LogItem;
  onEdit: () => void;
  onRemove: () => void;
  onSetState?: (estado: ItemState) => void;
}) {
  const { t } = useI18n();
  const diff = item.gramas_plano != null ? Number(item.gramas) - Number(item.gramas_plano) : 0;
  const st = itemState(item);
  const pending = st === "planeado" || st === "legado";
  const fromPlan = item.gramas_plano != null;
  // Toque no círculo: por confirmar → comido; comido (do plano) → volta a planeado; não comido → planeado
  const next: ItemState | null = pending ? "consumido" : st === "nao_comido" ? "planeado" : fromPlan ? "planeado" : null;
  const stateLabel =
    st === "planeado" ? t("consumo.porConfirmar") : st === "legado" ? t("consumo.legado") : st === "nao_comido" ? t("consumo.naoComido") : t("consumo.comido");
  return (
    <li className={`flex items-center gap-2 py-2 pr-2 ${onSetState ? "pl-2" : "pl-4"}`}>
      {onSetState && (
        <button
          className="icon-btn shrink-0"
          disabled={!next}
          onClick={() => next && onSetState(next)}
          aria-label={`${item.food_name}: ${stateLabel}`}
          aria-pressed={st === "consumido"}
          title={stateLabel}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
              st === "consumido" ? "border-accent bg-accent text-on-accent" : st === "nao_comido" ? "border-line text-muted" : "border-muted/60 text-transparent"
            }`}
          >
            <Icon name={st === "nao_comido" ? "x" : "check"} size={14} strokeWidth={2.5} />
          </span>
        </button>
      )}
      <button
        className={`min-w-0 flex-1 rounded-lg py-1 text-left ${pending || st === "nao_comido" ? "opacity-60" : ""}`}
        onClick={onEdit}
        aria-label={t("refeicao.editarQtd", { nome: item.food_name })}
      >
        <span className={`block truncate text-sm font-medium ${st === "nao_comido" ? "line-through" : ""}`}>{item.food_name}</span>
        <span className="tabular mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>{Number(item.gramas)} g</span>
          {diff !== 0 && (
            <span className="rounded bg-warn-soft px-1 font-medium text-warn">
              {diff > 0 ? "+" : ""}
              {t("refeicao.vsPlano", { g: diff })}
            </span>
          )}
          {item.gramas_plano == null && <span className="rounded bg-accent-soft px-1 font-medium text-accent">{t("refeicao.extra")}</span>}
          {onSetState && st !== "consumido" && <span className="rounded bg-card-2 px-1 font-medium">{stateLabel}</span>}
          <span>
            {t("macro.p")} {Math.round(item.protein)} · {t("macro.c")} {Math.round(item.carbs)} · {t("macro.g")} {Math.round(item.fat)}
          </span>
        </span>
      </button>
      <span className={`tabular w-12 shrink-0 text-right text-sm font-semibold ${pending || st === "nao_comido" ? "text-muted" : ""}`}>{Math.round(item.kcal)}</span>
      {onSetState && pending && (
        <button className="icon-btn shrink-0" onClick={() => onSetState("nao_comido")} aria-label={t("consumo.marcarNaoComido", { nome: item.food_name })} title={t("consumo.naoComi")}>
          <Icon name="minus" size={18} />
        </button>
      )}
      <button className="icon-btn hidden shrink-0 sm:inline-flex" onClick={onEdit} aria-label={t("comum.editarX", { nome: item.food_name })}>
        <Icon name="edit" size={18} />
      </button>
      <button className="icon-btn shrink-0 hover:!text-bad" onClick={onRemove} aria-label={t("comum.removerX", { nome: item.food_name })}>
        <Icon name="trash" size={18} />
      </button>
    </li>
  );
}
