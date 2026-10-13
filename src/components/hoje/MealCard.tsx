"use client";
import { useState } from "react";
import { sum, type LogItem } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";

export function MealCard({
  name,
  items,
  onAdd,
  onEdit,
  onRemove,
  onRepeat,
  repeatCount = 0,
  defaultOpen = false,
}: {
  name: string;
  items: LogItem[];
  onAdd: () => void;
  onEdit: (it: LogItem) => void;
  onRemove: (it: LogItem) => void;
  onRepeat?: () => void;
  repeatCount?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const t = sum(items);
  const empty = items.length === 0;
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
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${empty ? "bg-card-2 text-muted" : "bg-accent-soft text-accent"}`}
            aria-hidden="true"
          >
            <Icon name={empty ? "plus" : "check"} size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-snug">{name}</span>
            <span className="tabular block text-xs text-muted">
              {empty ? (
                "Vazio"
              ) : (
                <>
                  {items.length} {items.length === 1 ? "item" : "itens"} · P {Math.round(t.protein)} g
                  <span className="hidden sm:inline">
                    {" "}
                    · C {Math.round(t.carbs)} · G {Math.round(t.fat)}
                  </span>
                </>
              )}
            </span>
          </span>
          <span className="tabular shrink-0 text-right">
            <span className="font-semibold">{t.kcal}</span>
            <span className="block text-[11px] text-muted">kcal</span>
          </span>
          <Icon name="chevronDown" size={18} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <button className="icon-btn shrink-0 text-accent" onClick={onAdd} aria-label={`Adicionar alimento a ${name}`}>
          <Icon name="plus" />
        </button>
      </div>

      {open && (
        <div id={id} className="border-t border-line">
          {empty ? (
            <div className="flex flex-wrap items-center gap-2 px-4 py-4">
              <button className="btn btn-primary" onClick={onAdd}>
                <Icon name="plus" size={18} /> Adicionar alimento
              </button>
              {onRepeat && repeatCount > 0 && (
                <button className="btn btn-ghost" onClick={onRepeat}>
                  <Icon name="repeat" size={18} /> Repetir de ontem ({repeatCount})
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((it) => (
                <FoodItemRow key={it.id} item={it} onEdit={() => onEdit(it)} onRemove={() => onRemove(it)} />
              ))}
              <li>
                <button className="flex min-h-12 w-full items-center gap-2 px-4 text-sm font-medium text-accent hover:bg-card-2/60" onClick={onAdd}>
                  <Icon name="plus" size={18} /> Adicionar alimento
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function FoodItemRow({ item, onEdit, onRemove }: { item: LogItem; onEdit: () => void; onRemove: () => void }) {
  const diff = item.gramas_plano != null ? Number(item.gramas) - Number(item.gramas_plano) : 0;
  return (
    <li className="flex items-center gap-2 py-2 pl-4 pr-2">
      <button className="min-w-0 flex-1 rounded-lg py-1 text-left" onClick={onEdit} aria-label={`Editar quantidade de ${item.food_name}`}>
        <span className="block truncate text-sm font-medium">{item.food_name}</span>
        <span className="tabular mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>{Number(item.gramas)} g</span>
          {diff !== 0 && (
            <span className="rounded bg-warn-soft px-1 font-medium text-warn">
              {diff > 0 ? "+" : ""}
              {diff} g vs plano
            </span>
          )}
          {item.gramas_plano == null && <span className="rounded bg-accent-soft px-1 font-medium text-accent">extra</span>}
          <span>
            P {Math.round(item.protein)} · C {Math.round(item.carbs)} · G {Math.round(item.fat)}
          </span>
        </span>
      </button>
      <span className="tabular w-12 shrink-0 text-right text-sm font-semibold">{Math.round(item.kcal)}</span>
      <button className="icon-btn hidden shrink-0 sm:inline-flex" onClick={onEdit} aria-label={`Editar ${item.food_name}`}>
        <Icon name="edit" size={18} />
      </button>
      <button className="icon-btn shrink-0 hover:!text-bad" onClick={onRemove} aria-label={`Remover ${item.food_name}`}>
        <Icon name="trash" size={18} />
      </button>
    </li>
  );
}
