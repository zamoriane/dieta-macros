// Cliente da Calorie API (https://calorieapi.com/docs). Só corre no servidor.
import "server-only";

const BASE = "https://calorieapiadmin.com/api/v1";

async function call<T>(path: string): Promise<T> {
  const key = process.env.CALORIE_API_KEY;
  if (!key) throw new Error("CALORIE_API_KEY não configurada");
  const res = await fetch(BASE + path, { headers: { "X-API-Key": key }, cache: "no-store" });
  if (res.status === 429) throw new Error("Limite da Calorie API atingido. Tente daqui a pouco.");
  if (!res.ok) throw new Error(`Calorie API ${res.status}`);
  return res.json() as Promise<T>;
}

export type ApiSuggestion = { id: number; name: string; brand_name: string | null };

export type ApiFood = {
  id: number;
  name: string;
  brand_name: string | null;
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g?: number | null;
  sugar_100g?: number | null;
  default_portion?: { grams: number; label: string } | null;
  verified_portions?: { grams: number; label?: string; description?: string }[] | null;
};

export async function suggest(q: string, limit = 12): Promise<ApiSuggestion[]> {
  const r = await call<{ data?: ApiSuggestion[] } | ApiSuggestion[]>(
    `/search/suggest?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  return Array.isArray(r) ? r : (r.data ?? []);
}

export async function search(q: string, limit = 15): Promise<ApiFood[]> {
  const r = await call<{ data: ApiFood[] }>(`/search/foods?q=${encodeURIComponent(q)}&limit=${limit}`);
  return r.data ?? [];
}

export async function foodById(id: number): Promise<ApiFood> {
  const r = await call<ApiFood | { data: ApiFood }>(`/foods/${id}`);
  return "data" in r && r.data ? r.data : (r as ApiFood);
}

/** Converte para uma linha da tabela `foods`. */
export function toFoodRow(f: ApiFood) {
  const portions: { label: string; grams: number }[] = [];
  for (const p of f.verified_portions ?? []) {
    if (p.grams > 0) portions.push({ label: p.label ?? p.description ?? `${p.grams} g`, grams: p.grams });
  }
  if (f.default_portion && !portions.some((p) => p.grams === f.default_portion!.grams)) {
    portions.unshift({ label: f.default_portion.label, grams: f.default_portion.grams });
  }
  return {
    source: "calorieapi" as const,
    external_id: f.id,
    user_id: null,
    name: f.name,
    brand: f.brand_name,
    kcal_100g: f.calories_100g ?? 0,
    protein_100g: f.protein_100g ?? 0,
    carbs_100g: f.carbs_100g ?? 0,
    fat_100g: f.fat_100g ?? 0,
    fiber_100g: f.fiber_100g ?? 0,
    sugar_100g: f.sugar_100g ?? 0,
    portions,
    atualizado_em: new Date().toISOString(),
  };
}
