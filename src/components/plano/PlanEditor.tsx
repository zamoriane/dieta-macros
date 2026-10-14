"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { scale, type Targets } from "@/lib/nutrition";
import { getPlan, sum, type PlanItem, type PlanMeal } from "@/lib/data";
import { FoodPicker, GramsInput, MacroPreview } from "@/components/FoodPicker";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { EmptyState, FormField, ProgressBar, SectionCard, Skeleton } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";

const DEFAULT_MEALS: MessageKey[] = ["plano.ref.pa", "plano.ref.lancheManha", "plano.ref.almoco", "plano.ref.lanche", "plano.ref.jantar"];

type Change = { id: number; actor_id: string | null; acao: string; resumo: string; em: string };

/**
 * Editor do plano alimentar base. Serve o próprio utilizador (/plano) e o treinador
 * a editar o plano de um cliente (/clientes/[id]); `ownerId` é sempre o dono do plano.
 */
export function PlanEditor({
  ownerId,
  viewerId,
  targets,
  names = {},
}: {
  ownerId: string;
  viewerId: string;
  targets?: Targets | null;
  names?: Record<string, string>;
}) {
  const { t, df } = useI18n();
  const sb = useMemo(() => createClient(), []);
  const [meals, setMeals] = useState<PlanMeal[]>([]);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [picker, setPicker] = useState<PlanMeal | null>(null);
  const [editItem, setEditItem] = useState<PlanItem | null>(null);
  const [grams, setGrams] = useState("");
  const [mealDialog, setMealDialog] = useState<{ mode: "new" | "rename"; meal?: PlanMeal } | null>(null);
  const [mealName, setMealName] = useState("");
  const [deleteMeal, setDeleteMeal] = useState<PlanMeal | null>(null);

  const load = useCallback(async () => {
    const [p, { data: ch }] = await Promise.all([
      getPlan(sb, ownerId),
      sb.from("plan_changes").select("id, actor_id, acao, resumo, em").eq("owner_id", ownerId).order("em", { ascending: false }).order("id", { ascending: false }).limit(30),
    ]);
    setMeals(p.meals);
    setItems(p.items);
    setChanges((ch ?? []) as Change[]);
    setLoaded(true);
  }, [sb, ownerId]);

  useEffect(() => {
    load();
  }, [load]);

  const macrosOf = (it: PlanItem) => scale(it.foods, Number(it.gramas));
  const totals = sum(items.map(macrosOf));
  const who = (id: string | null) => (!id ? t("comum.sistema") : id === viewerId ? t("comum.porVoce") : names[id] ?? t("comum.outraPessoa"));

  async function saveMeal() {
    const nome = mealName.trim();
    if (!nome || !mealDialog) return;
    const { error } =
      mealDialog.mode === "new"
        ? await sb.from("plan_meals").insert({ user_id: ownerId, nome, posicao: meals.length })
        : await sb.from("plan_meals").update({ nome }).eq("id", mealDialog.meal!.id);
    if (error) return toast(error.message, { kind: "erro" });
    setMealDialog(null);
    await load();
    toast(mealDialog.mode === "new" ? t("plano.refCriada") : t("plano.refRenomeada"));
  }

  async function createDefaults() {
    const { error } = await sb.from("plan_meals").insert(DEFAULT_MEALS.map((k, i) => ({ user_id: ownerId, nome: t(k), posicao: i })));
    if (error) return toast(error.message, { kind: "erro" });
    load();
  }

  async function move(m: PlanMeal, dir: -1 | 1) {
    const idx = meals.findIndex((x) => x.id === m.id);
    const other = meals[idx + dir];
    if (!other) return;
    await Promise.all([
      sb.from("plan_meals").update({ posicao: other.posicao }).eq("id", m.id),
      sb.from("plan_meals").update({ posicao: m.posicao }).eq("id", other.id),
    ]);
    load();
  }

  async function confirmDeleteMeal() {
    if (!deleteMeal) return;
    const { error } = await sb.from("plan_meals").delete().eq("id", deleteMeal.id);
    if (error) return toast(error.message, { kind: "erro" });
    setDeleteMeal(null);
    await load();
    toast(t("plano.refApagada", { nome: deleteMeal.nome }));
  }

  async function saveGrams() {
    const g = Number(grams.replace(",", "."));
    if (!editItem || !(g > 0)) return;
    const { error } = await sb.from("plan_items").update({ gramas: g }).eq("id", editItem.id);
    if (error) return toast(error.message, { kind: "erro" });
    setEditItem(null);
    await load();
    toast(t("hoje.qtdAtualizada"));
  }

  async function removeItem(it: PlanItem) {
    const { error } = await sb.from("plan_items").delete().eq("id", it.id);
    if (error) return toast(error.message, { kind: "erro" });
    await load();
    toast(t("plano.removido", { nome: it.foods.name }), {
      action: {
        label: t("comum.desfazer"),
        run: async () => {
          await sb.from("plan_items").insert({ user_id: ownerId, plan_meal_id: it.plan_meal_id, food_id: it.food_id, gramas: it.gramas, posicao: it.posicao });
          load();
        },
      },
    });
  }

  const eg = Number(grams.replace(",", "."));

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="min-w-0 space-y-5 lg:sticky lg:top-24">
        <SectionCard title={t("plano.total")}>
          <div className="tabular flex items-baseline gap-2">
            <span className="text-3xl font-bold">{totals.kcal}</span>
            <span className="text-sm text-muted">{targets ? t("plano.deMetaDia", { meta: targets.kcal }) : "kcal"}</span>
          </div>
          {targets && (
            <p className={`mt-1 text-xs ${Math.abs(totals.kcal - targets.kcal) <= targets.kcal * 0.05 ? "text-good" : "text-warn"}`}>
              {Math.abs(totals.kcal - targets.kcal) <= targets.kcal * 0.05
                ? t("plano.alinhado")
                : totals.kcal > targets.kcal
                  ? t("plano.acimaMeta", { kcal: totals.kcal - targets.kcal })
                  : t("plano.abaixoMeta", { kcal: targets.kcal - totals.kcal })}
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {(
              [
                ["protein", t("macro.proteina"), "prot"],
                ["carbs", t("macro.hidratos"), "carb"],
                ["fat", t("macro.gordura"), "fat"],
              ] as const
            ).map(([k, label, color]) => (
              <li key={k}>
                <div className="tabular mb-1 flex justify-between text-sm">
                  <span>{label}</span>
                  <span>
                    <span className="font-semibold">{Math.round(totals[k])}</span>
                    {targets && <span className="text-muted"> / {targets[k]} g</span>}
                  </span>
                </div>
                {targets ? <ProgressBar value={totals[k]} target={targets[k]} color={color} label={label} /> : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">{t("plano.explica")}</p>
        </SectionCard>

        <SectionCard title={t("hist.titulo")}>
          {changes.length ? (
            <ul className="space-y-2.5 text-sm">
              {changes.slice(0, 12).map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.acao === "removeu" ? "bg-bad" : c.acao === "criou" ? "bg-good" : "bg-warn"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      <span>{t(`hist.${c.acao}` as MessageKey)}</span> {c.resumo}
                    </span>
                    <span className="text-xs text-muted">
                      {t("hist.por", { quem: who(c.actor_id) })} · {df(new Date(c.em), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("plano.histVazio")}</p>
          )}
        </SectionCard>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("hoje.refeicoes")}</h2>
          <button
            className="btn btn-ghost !min-h-10 !px-3"
            onClick={() => {
              setMealName("");
              setMealDialog({ mode: "new" });
            }}
          >
            <Icon name="plus" size={18} /> {t("hoje.refeicao")}
          </button>
        </div>

        {!loaded && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}

        {loaded && meals.length === 0 && (
          <EmptyState icon="plan" title={t("plano.vazio")}>
            <button className="btn btn-primary mt-2" onClick={createDefaults}>
              {t("plano.criarPadrao")}
            </button>
            <p className="mt-2 text-xs">{DEFAULT_MEALS.map((k) => t(k)).join(" · ")}</p>
          </EmptyState>
        )}

        {meals.map((m, i) => {
          const its = items.filter((it) => it.plan_meal_id === m.id);
          const tt = sum(its.map(macrosOf));
          return (
            <section key={m.id} className="card overflow-hidden">
              <div className="flex items-center gap-1 py-2 pl-4 pr-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold leading-snug">{m.nome}</h3>
                  <p className="tabular text-xs text-muted">
                    {tt.kcal} kcal · {t("macro.p")} {Math.round(tt.protein)} g · {t("macro.c")} {Math.round(tt.carbs)} · {t("macro.g")} {Math.round(tt.fat)}
                  </p>
                </div>
                <button className="icon-btn" disabled={i === 0} style={i === 0 ? { opacity: 0.3 } : undefined} onClick={() => move(m, -1)} aria-label={t("comum.subir", { nome: m.nome })}>
                  <Icon name="chevronDown" size={18} className="rotate-180" />
                </button>
                <button
                  className="icon-btn"
                  disabled={i === meals.length - 1}
                  style={i === meals.length - 1 ? { opacity: 0.3 } : undefined}
                  onClick={() => move(m, 1)}
                  aria-label={t("comum.descer", { nome: m.nome })}
                >
                  <Icon name="chevronDown" size={18} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => {
                    setMealName(m.nome);
                    setMealDialog({ mode: "rename", meal: m });
                  }}
                  aria-label={t("comum.renomear", { nome: m.nome })}
                >
                  <Icon name="edit" size={18} />
                </button>
                <button className="icon-btn hover:!text-bad" onClick={() => setDeleteMeal(m)} aria-label={t("comum.apagarX", { nome: m.nome })}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
              <ul className="divide-y divide-line border-t border-line">
                {its.map((it) => {
                  const mm = macrosOf(it);
                  return (
                    <li key={it.id} className="flex items-center gap-2 py-2 pl-4 pr-2">
                      <button
                        className="min-w-0 flex-1 py-1 text-left"
                        onClick={() => {
                          setEditItem(it);
                          setGrams(String(Number(it.gramas)));
                        }}
                        aria-label={t("refeicao.editarQtd", { nome: it.foods.name })}
                      >
                        <span className="block text-sm font-medium leading-snug">{it.foods.name}</span>
                        <span className="tabular text-xs text-muted">
                          {Number(it.gramas)} g · {Math.round(Number(it.foods.kcal_100g))} kcal/100 g · {t("macro.p")} {Math.round(mm.protein)}
                        </span>
                      </button>
                      <span className="tabular w-12 shrink-0 text-right text-sm font-semibold">{Math.round(mm.kcal)}</span>
                      <button className="icon-btn shrink-0 hover:!text-bad" onClick={() => removeItem(it)} aria-label={t("comum.removerX", { nome: it.foods.name })}>
                        <Icon name="trash" size={18} />
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button className="flex min-h-12 w-full items-center gap-2 px-4 text-sm font-medium text-accent hover:bg-card-2/60" onClick={() => setPicker(m)}>
                    <Icon name="plus" size={18} /> {t("refeicao.adicionarAlimento")}
                  </button>
                </li>
              </ul>
            </section>
          );
        })}
      </div>

      {picker && (
        <FoodPicker
          title={t("hoje.adicionarA", { nome: picker.nome })}
          onClose={() => setPicker(null)}
          onPick={async (food, g) => {
            const { error } = await sb.from("plan_items").insert({
              user_id: ownerId,
              plan_meal_id: picker.id,
              food_id: food.id,
              gramas: g,
              posicao: items.filter((x) => x.plan_meal_id === picker.id).length,
            });
            if (error) return toast(error.message, { kind: "erro" });
            await load();
            toast(t("plano.adicionado", { nome: food.name }));
          }}
        />
      )}

      <ResponsiveDialog
        open={!!editItem}
        title={editItem?.foods.name ?? ""}
        onClose={() => setEditItem(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setEditItem(null)}>
              {t("comum.cancelar")}
            </button>
            <button className="btn btn-primary flex-1" disabled={!(eg > 0)} onClick={saveGrams}>
              {t("comum.guardar")}
            </button>
          </>
        }
      >
        {editItem && (
          <div className="space-y-4">
            <GramsInput value={grams} onChange={setGrams} />
            {eg > 0 && <MacroPreview m={scale(editItem.foods, eg)} />}
          </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!mealDialog}
        title={mealDialog?.mode === "rename" ? t("plano.renomearRef") : t("hoje.novaRefeicao")}
        onClose={() => setMealDialog(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setMealDialog(null)}>
              {t("comum.cancelar")}
            </button>
            <button className="btn btn-primary flex-1" disabled={!mealName.trim()} onClick={saveMeal}>
              {t("comum.guardar")}
            </button>
          </>
        }
      >
        <FormField label={t("comum.nome")} hint={t("plano.refDica")}>
          <input
            data-autofocus
            className="w-full"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveMeal()}
          />
        </FormField>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!deleteMeal}
        title={t("plano.apagarRef")}
        onClose={() => setDeleteMeal(null)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setDeleteMeal(null)}>
              {t("comum.cancelar")}
            </button>
            <button className="btn flex-1 bg-bad text-white" onClick={confirmDeleteMeal}>
              {t("comum.apagar")}
            </button>
          </>
        }
      >
        <p className="text-sm">
          {t("plano.apagarRefPergunta", { nome: deleteMeal?.nome ?? "" })}
        </p>
      </ResponsiveDialog>
    </div>
  );
}
