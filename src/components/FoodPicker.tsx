"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { scale } from "@/lib/nutrition";
import { addDays, getUserId, isoDay, me, type Food } from "@/lib/data";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Icon } from "@/components/ui/Icon";
import { FormField } from "@/components/ui/Primitives";
import { useI18n } from "@/lib/i18n/client";
import { SOURCE_LABEL, sourceCredit, type CatalogSource } from "@/lib/foodCatalog";

type Props = {
  title?: string;
  onPick: (food: Food, grams: number) => Promise<void> | void;
  onClose: () => void;
};

/** Pesquisa e adição de alimentos: recentes, pesquisa (catálogo INSA/TACO + base local + Calorie API), alimento próprio. */
export function FoodPicker({ title, onPick, onClose }: Props) {
  const { t } = useI18n();
  const sb = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [recent, setRecent] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const [moreAvailable, setMoreAvailable] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recentes: alimentos usados nos últimos 30 dias
  useEffect(() => {
    (async () => {
      const uid = await me(sb);
      const { data } = await sb
        .from("log_items")
        .select("food_id")
        .eq("user_id", uid)
        .gte("dia", addDays(isoDay(), -30))
        .not("food_id", "is", null)
        .order("criado_em", { ascending: false })
        .limit(200);
      const ids = [...new Set((data ?? []).map((r) => r.food_id as number))].slice(0, 12);
      if (!ids.length) return;
      const { data: fs } = await sb.from("foods").select("*").in("id", ids);
      const byId = new Map((fs ?? []).map((f) => [f.id as number, f as Food]));
      setRecent(ids.map((id) => byId.get(id)).filter(Boolean) as Food[]);
    })();
  }, [sb]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setFoods([]);
      setMoreAvailable(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      setErr(null);
      try {
        const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q.trim())}${more ? "&mais=1" : ""}`);
        const j = await res.json();
        setFoods(j.foods ?? []);
        setMoreAvailable(!!j.maisDisponivel);
        if (j.apiError) setErr(j.apiError);
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    }, more ? 0 : 400);
  }, [q, more]);

  const g = Number(grams.replace(",", "."));
  const preview = selected && g > 0 ? scale(selected, g) : null;

  function choose(f: Food) {
    setSelected(f);
    setGrams(String(f.portions?.[0]?.grams ?? 100));
  }

  async function confirm() {
    if (!selected || !(g > 0)) return;
    setSaving(true);
    try {
      await onPick(selected, g);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const dialogTitle = selected ? selected.name : creating ? t("food.novo") : title ?? t("refeicao.adicionarAlimento");

  if (creating) {
    return (
      <ResponsiveDialog open title={dialogTitle} onClose={onClose}>
        <CustomFoodForm
          sb={sb}
          initialName={q}
          onCancel={() => setCreating(false)}
          onCreated={(f) => {
            setCreating(false);
            setSelected(f);
            setGrams("100");
          }}
        />
      </ResponsiveDialog>
    );
  }

  if (selected) {
    return (
      <ResponsiveDialog
        open
        title={dialogTitle}
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setSelected(null)}>
              {t("comum.voltar")}
            </button>
            <button className="btn btn-primary flex-1" disabled={!(g > 0) || saving} onClick={confirm}>
              {saving ? t("comum.aAdicionar") : t("comum.adicionar")}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-muted">
            {t("food.kcalPor100", { kcal: Math.round(Number(selected.kcal_100g)) })}{selected.brand ? ` · ${selected.brand}` : ""}
            {selected.grupo ? ` · ${selected.grupo}` : ""}
          </p>
          {selected.unidade === "ml" && <p className="text-xs text-muted">{t("food.mlNota")}</p>}
          <GramsInput value={grams} onChange={setGrams} />
          {selected.portions?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.portions.slice(0, 6).map((p) => (
                <button key={p.label + p.grams} onClick={() => setGrams(String(p.grams))} className="btn btn-ghost !min-h-9 !px-3 !text-xs !font-medium">
                  {p.label} · {p.grams} g
                </button>
              ))}
            </div>
          )}
          {preview && <MacroPreview m={preview} />}
          {selected.extra?.hidratos === "totais" && <p className="text-xs text-muted">{t("food.hidratosTotais")}</p>}
          {sourceCredit(selected.source, selected.versao) && <p className="text-[11px] leading-snug text-muted">{sourceCredit(selected.source, selected.versao)}</p>}
        </div>
      </ResponsiveDialog>
    );
  }

  const list = q.trim().length >= 2 ? foods : recent;
  return (
    <ResponsiveDialog open title={dialogTitle} onClose={onClose} wide>
      <div className="sticky top-0 z-10 -mx-1 bg-card px-1 pb-3">
        <div className="relative">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            data-autofocus
            className="w-full !pl-10"
            placeholder={t("food.pesquisarPh")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setMore(false);
            }}
            aria-label={t("food.pesquisar")}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted">{t("food.dica")}</p>
      </div>

      {q.trim().length < 2 && recent.length > 0 && (
        <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Icon name="clock" size={14} /> {t("food.recentes")}
        </h3>
      )}

      {loading ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="skeleton h-14" />
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((f) => (
            <li key={f.id}>
              <button className="flex w-full items-center gap-3 rounded-lg py-3 text-left hover:bg-card-2" onClick={() => choose(f)}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {f.name}
                    {f.source === "custom" && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-px text-[10px] font-semibold text-accent">{t("food.meu")}</span>}
                    {(f.source === "insa" || f.source === "taco") && (
                      <span className="ml-1.5 rounded bg-card-2 px-1.5 py-px text-[10px] font-semibold text-muted">{SOURCE_LABEL[f.source]}</span>
                    )}
                  </div>
                  <div className="tabular mt-0.5 text-xs text-muted">
                    {f.brand ? `${f.brand} · ` : ""}{t("macro.p")} {f.protein_100g} · {t("macro.c")} {f.carbs_100g} · {t("macro.g")} {f.fat_100g} <span className="opacity-70">{f.unidade === "ml" ? t("food.por100ml") : "/100 g"}</span>
                  </div>
                </div>
                <div className="tabular shrink-0 text-right text-sm font-semibold">
                  {Math.round(Number(f.kcal_100g))}
                  <div className="text-[11px] font-normal text-muted">kcal</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && q.trim().length >= 2 && foods.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("food.nada", { q })}</p>}
      {!loading && q.trim().length >= 2 && moreAvailable && (
        <button className="btn btn-ghost mt-2 w-full !text-sm" onClick={() => setMore(true)}>
          <Icon name="search" size={16} /> {t("food.procurarMais")}
        </button>
      )}
      {!loading && <Credits sources={list.map((f) => f.source)} versions={list} />}
      {err && <p className="mt-2 text-xs text-warn">{err}</p>}

      <button className="btn btn-ghost mt-4 w-full" onClick={() => setCreating(true)}>
        <Icon name="plus" size={18} /> {t("food.criarProprio")}
      </button>
    </ResponsiveDialog>
  );
}

export function GramsInput({ value, onChange, step = 10 }: { value: string; onChange: (v: string) => void; step?: number }) {
  const { t } = useI18n();
  const n = Number(value.replace(",", ".")) || 0;
  const bump = (d: number) => onChange(String(Math.max(0, Math.round((n + d) * 10) / 10)));
  return (
    <div className="flex items-center gap-2">
      <button className="icon-btn border border-line" onClick={() => bump(-step)} aria-label={t("food.menosG", { g: step })}>
        <Icon name="minus" />
      </button>
      <div className="relative flex-1">
        <input
          data-autofocus
          inputMode="decimal"
          className="tabular w-full text-center !text-2xl font-semibold"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("food.qtdGramas")}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">g</span>
      </div>
      <button className="icon-btn border border-line" onClick={() => bump(step)} aria-label={t("food.maisG", { g: step })}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function MacroPreview({ m }: { m: { kcal: number; protein: number; carbs: number; fat: number } }) {
  const { t } = useI18n();
  const cells = [
    { label: "kcal", v: Math.round(m.kcal), c: "text-ink" },
    { label: t("macro.proteina"), v: m.protein, c: "text-prot-ink" },
    { label: t("macro.hidratosCurto"), v: m.carbs, c: "text-carb-ink" },
    { label: t("macro.gordura"), v: m.fat, c: "text-fat-ink" },
  ];
  return (
    <div className="tabular grid grid-cols-4 gap-2 text-center">
      {cells.map((x) => (
        <div key={x.label} className="rounded-xl bg-card-2 py-2.5">
          <div className={`text-base font-semibold ${x.c}`}>{x.v}</div>
          <div className="text-[11px] text-muted">{x.label}</div>
        </div>
      ))}
    </div>
  );
}

function CustomFoodForm({
  sb,
  initialName,
  onCancel,
  onCreated,
}: {
  sb: ReturnType<typeof createClient>;
  initialName: string;
  onCancel: () => void;
  onCreated: (f: Food) => void;
}) {
  const { t } = useI18n();
  const [f, setF] = useState({ name: initialName, kcal: "", p: "", c: "", g: "", fib: "" });
  const [err, setErr] = useState<string | null>(null);
  const n = (s: string) => Number(s.replace(",", ".")) || 0;

  async function save() {
    if (!f.name.trim()) return setErr(t("food.errNome"));
    if (!(n(f.kcal) > 0)) return setErr(t("food.errKcal"));
    const userId = await getUserId(sb);
    const { data, error } = await sb
      .from("foods")
      .insert({
        user_id: userId,
        source: "custom",
        name: f.name.trim(),
        kcal_100g: n(f.kcal),
        protein_100g: n(f.p),
        carbs_100g: n(f.c),
        fat_100g: n(f.g),
        fiber_100g: n(f.fib),
      })
      .select("*")
      .single();
    if (error) return setErr(error.message);
    onCreated(data as Food);
  }

  const field = (key: keyof typeof f, label: string) => (
    <FormField label={label}>
      <input inputMode="decimal" className="tabular w-full" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </FormField>
  );

  return (
    <div className="space-y-4">
      <FormField label={t("comum.nome")}>
        <input data-autofocus className="w-full" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </FormField>
      <p className="text-xs text-muted">{t("food.valoresRotulo")}</p>
      <div className="grid grid-cols-2 gap-3">
        {field("kcal", "kcal")}
        {field("p", `${t("macro.proteina")} (g)`)}
        {field("c", `${t("macro.hidratos")} (g)`)}
        {field("g", `${t("macro.gordura")} (g)`)}
        {field("fib", `${t("macro.fibra")} (g)`)}
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button className="btn btn-ghost flex-1" onClick={onCancel}>
          {t("comum.cancelar")}
        </button>
        <button className="btn btn-primary flex-1" onClick={save}>
          {t("comum.guardar")}
        </button>
      </div>
    </div>
  );
}

/** Crédito obrigatório das tabelas oficiais usadas nos resultados. */
function Credits({ sources, versions }: { sources: string[]; versions: Food[] }) {
  const used = (["insa", "taco"] as CatalogSource[]).filter((s) => sources.includes(s));
  if (!used.length) return null;
  return (
    <div className="mt-3 space-y-0.5 text-[11px] leading-snug text-muted">
      {used.map((s) => (
        <p key={s}>{sourceCredit(s, versions.find((f) => f.source === s)?.versao)}</p>
      ))}
    </div>
  );
}
