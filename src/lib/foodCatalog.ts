// Leitura das tabelas oficiais de composição de alimentos (Excel) e comparação com o catálogo.
// Funções puras: recebem as folhas já lidas (ver xlsx.ts) e não tocam na base de dados.
import type { Cell, Sheet } from "./xlsx.ts";

export type CatalogSource = "insa" | "taco";

export const SOURCE_LABEL: Record<CatalogSource, string> = { insa: "INSA", taco: "TACO" };

/** Texto de crédito exigido pelas condições de utilização de cada tabela. */
export function sourceCredit(source: string, versao?: string | null): string | null {
  if (source === "insa") return `Fonte: Base de Dados da Composição de Alimentos. Instituto Nacional de Saúde Doutor Ricardo Jorge, I. P. – INSA${versao ? `. v ${versao}` : ""}.`;
  if (source === "taco") return `Fonte: Tabela Brasileira de Composição de Alimentos – TACO${versao ? `, ${versao}` : ""}. NEPA/UNICAMP.`;
  return null;
}

export type CatalogRow = {
  external_id: number;
  name: string;
  grupo: string | null;
  unidade: "g" | "ml";
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number;
  sugar_100g: number;
  extra: Record<string, number | string>;
};

export type Ignored = { linha: number; nome: string; motivo: string };

export type ParsedCatalog = {
  source: CatalogSource;
  versao: string;
  rows: CatalogRow[];
  ignored: Ignored[];
  notas: string[];
};

/** Cabeçalho normalizado: minúsculas, sem acentos, espaços simples. */
export function norm(s: Cell): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Valor numérico de uma célula. "Tr" (traço) = 0; vazio, "NA" e "*" (em reavaliação) = sem valor.
 * Aceita vírgula decimal e pequenas gralhas como ",0,02".
 */
export function num(c: Cell): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (typeof c !== "string") return null;
  const s = c.trim().toLowerCase();
  if (!s || s === "na" || s === "*" || s === "-") return null;
  if (s === "tr") return 0;
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

type ColSpec = Record<string, (h: string) => boolean>;

function findCols(headers: string[], spec: ColSpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, test] of Object.entries(spec)) {
    const i = headers.findIndex((h) => h && test(h));
    if (i >= 0) out[key] = i;
  }
  return out;
}

function requireCols(found: Record<string, number>, keys: string[], fonte: string) {
  const missing = keys.filter((k) => found[k] === undefined);
  if (missing.length) {
    throw new Error(`O formato do Excel ${fonte} mudou: não encontrei as colunas ${missing.join(", ")}. Nada foi importado.`);
  }
}

// ---------------------------------------------------------------------------
// INSA (Portugal) — folha "INSA - BDCA_v x.y - aaaa", 1 linha de cabeçalho com "Cod" e "Nome do alimento"
// ---------------------------------------------------------------------------
const INSA_COLS: ColSpec = {
  cod: (h) => h === "cod",
  nome: (h) => h === "nome do alimento",
  nivel1: (h) => h.startsWith("nivel 1"),
  nivel2: (h) => h.startsWith("nivel 2"),
  kcal: (h) => h.startsWith("energia") && h.includes("kcal"),
  fat: (h) => h.startsWith("lipidos"),
  sat: (h) => h.startsWith("acidos gordos saturados"),
  carbs: (h) => h.startsWith("hidratos de carbono"),
  sugar: (h) => h.startsWith("acucares"),
  salt: (h) => /^sal \[/.test(h),
  fiber: (h) => h.startsWith("fibra"),
  protein: (h) => h.startsWith("proteinas"),
  alcohol: (h) => h.startsWith("alcool"),
  cholesterol: (h) => h.startsWith("colesterol"),
  sodium: (h) => h.startsWith("sodio"),
  potassium: (h) => h.startsWith("potassio"),
  calcium: (h) => h.startsWith("calcio"),
  iron: (h) => h.startsWith("ferro"),
};

function isInsa(sheets: Sheet[]) {
  return sheets.some((s) => s.rows.slice(0, 10).some((r) => r.some((c) => norm(c) === "cod") && r.some((c) => norm(c) === "nome do alimento")));
}

export function parseInsa(sheets: Sheet[]): ParsedCatalog {
  const sheet = sheets.find((s) => s.rows.slice(0, 10).some((r) => r.some((c) => norm(c) === "nome do alimento")));
  if (!sheet) throw new Error("Não encontrei a folha da tabela do INSA no Excel.");
  const h = sheet.rows.findIndex((r) => r.some((c) => norm(c) === "nome do alimento"));
  const cols = findCols(sheet.rows[h].map(norm), INSA_COLS);
  requireCols(cols, ["cod", "nome", "kcal", "fat", "carbs", "fiber", "protein"], "do INSA");

  const v = sheet.name.match(/v\s*([\d.]+)\s*-\s*(\d{4})/i);
  const versao = v ? `${v[1]} - ${v[2]}` : sheet.name.trim();
  const notas: string[] = [];
  const info = sheets.find((s) => s !== sheet && norm(s.name).startsWith("informacao"));
  const atual = info?.rows.flat().find((c) => /atualizado em/i.test(String(c ?? "")));
  if (atual) notas.push(String(atual).trim());

  const rows: CatalogRow[] = [];
  const ignored: Ignored[] = [];
  const seen = new Set<number>();
  for (let i = h + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i];
    const cod = num(r[cols.cod]);
    const nome = String(r[cols.nome] ?? "").trim();
    if (cod == null && !nome) continue;
    if (cod == null || !Number.isInteger(cod) || cod <= 0) {
      ignored.push({ linha: i + 1, nome, motivo: "código inválido" });
      continue;
    }
    if (!nome) {
      ignored.push({ linha: i + 1, nome: String(cod), motivo: "sem nome" });
      continue;
    }
    if (seen.has(cod)) {
      ignored.push({ linha: i + 1, nome, motivo: `código ${cod} repetido` });
      continue;
    }
    const kcal = num(r[cols.kcal]);
    if (kcal == null) {
      ignored.push({ linha: i + 1, nome, motivo: "sem valor de energia" });
      continue;
    }
    seen.add(cod);
    const g = (k: string) => (cols[k] === undefined ? null : num(r[cols[k]]));
    const nivel1 = cols.nivel1 === undefined ? "" : String(r[cols.nivel1] ?? "").trim();
    const extra: Record<string, number | string> = { hidratos: "disponiveis" };
    for (const k of ["sat", "salt", "alcohol", "cholesterol", "sodium", "potassium", "calcium", "iron"]) {
      const x = g(k);
      if (x != null) extra[k] = r2(x);
    }
    const nivel2 = cols.nivel2 === undefined ? "" : String(r[cols.nivel2] ?? "").trim();
    if (nivel2) extra.subgrupo = nivel2;
    rows.push({
      external_id: cod,
      name: nome,
      grupo: nivel1 || null,
      // Na tabela do INSA as bebidas alcoólicas vêm por 100 ml
      unidade: norm(nivel1).startsWith("bebidas alcoolicas") ? "ml" : "g",
      kcal_100g: r2(kcal),
      protein_100g: r2(g("protein") ?? 0),
      carbs_100g: r2(g("carbs") ?? 0),
      fat_100g: r2(g("fat") ?? 0),
      fiber_100g: r2(g("fiber") ?? 0),
      sugar_100g: r2(g("sugar") ?? 0),
      extra,
    });
  }
  return { source: "insa", versao, rows, ignored, notas };
}

// ---------------------------------------------------------------------------
// TACO (Brasil) — folha "CMVCol taco3": cabeçalho em 3 linhas, grupos como linhas de título,
// cabeçalho repetido a cada página e uma legenda no fim.
// ---------------------------------------------------------------------------
const TACO_COLS: ColSpec = {
  num: (h) => h.includes("numero do") && h.includes("alimento"),
  nome: (h) => h.includes("descricao dos alimentos"),
  kcal: (h) => h.includes("energia") && h.includes("kcal"),
  protein: (h) => h.startsWith("proteina"),
  fat: (h) => h.startsWith("lipideos"),
  cholesterol: (h) => h.startsWith("colesterol"),
  carbs: (h) => h.startsWith("carbo"),
  fiber: (h) => h.startsWith("fibra"),
  calcium: (h) => h.startsWith("calcio"),
  iron: (h) => h.startsWith("ferro"),
  sodium: (h) => h.startsWith("sodio"),
  potassium: (h) => h.startsWith("potassio"),
};

function tacoSheet(sheets: Sheet[]) {
  return sheets.find((s) => {
    const top = s.rows.slice(0, 6).flat().map(norm);
    return top.includes("descricao dos alimentos") && top.some((c) => c.includes("energia"));
  });
}

export function parseTaco(sheets: Sheet[]): ParsedCatalog {
  const sheet = tacoSheet(sheets);
  if (!sheet) throw new Error("Não encontrei a folha da composição centesimal da TACO no Excel.");
  const h = sheet.rows.findIndex((r) => r.some((c) => norm(c) === "descricao dos alimentos"));
  // Junta as linhas do cabeçalho (até 2 acima) por coluna: "Energia" + "(kcal)" → "energia (kcal)"
  const width = Math.max(...sheet.rows.slice(Math.max(0, h - 2), h + 1).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, c) =>
    norm(
      sheet.rows
        .slice(Math.max(0, h - 2), h + 1)
        .map((r) => r[c] ?? "")
        .join(" "),
    ).replace(/- /g, ""),
  );
  const cols = findCols(headers, TACO_COLS);
  requireCols(cols, ["num", "nome", "kcal", "protein", "fat", "carbs", "fiber"], "da TACO");

  const rows: CatalogRow[] = [];
  const ignored: Ignored[] = [];
  const seen = new Set<number>();
  let grupo: string | null = null;
  for (let i = h + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i];
    const first = r[cols.num];
    const nome = String(r[cols.nome] ?? "").trim().replace(/\s+/g, " ");
    if (typeof first === "string" && !nome) {
      const t = norm(first);
      if (t === "legenda") break; // fim da tabela
      if (t && !t.startsWith("numero do") && t !== "alimento") grupo = first.trim();
      continue;
    }
    const id = num(first);
    if (id == null || !nome) continue; // linhas de cabeçalho repetido ou vazias
    if (!Number.isInteger(id) || id <= 0) {
      ignored.push({ linha: i + 1, nome, motivo: "número inválido" });
      continue;
    }
    if (seen.has(id)) {
      ignored.push({ linha: i + 1, nome, motivo: `número ${id} repetido` });
      continue;
    }
    const kcal = num(r[cols.kcal]);
    if (kcal == null) {
      const raw = String(r[cols.kcal] ?? "").trim();
      ignored.push({ linha: i + 1, nome, motivo: raw === "*" ? "energia em reavaliação na TACO (*)" : "sem valor de energia" });
      continue;
    }
    seen.add(id);
    const g = (k: string) => (cols[k] === undefined ? null : num(r[cols[k]]));
    // Na TACO os hidratos de carbono são totais (incluem a fibra)
    const extra: Record<string, number | string> = { hidratos: "totais" };
    for (const k of ["cholesterol", "sodium", "potassium", "calcium", "iron"]) {
      const x = g(k);
      if (x != null) extra[k] = r2(x);
    }
    rows.push({
      external_id: id,
      name: nome,
      grupo,
      unidade: "g",
      kcal_100g: r2(kcal),
      protein_100g: r2(g("protein") ?? 0),
      carbs_100g: r2(g("carbs") ?? 0),
      fat_100g: r2(g("fat") ?? 0),
      fiber_100g: r2(g("fiber") ?? 0),
      sugar_100g: 0,
      extra,
    });
  }
  return { source: "taco", versao: "4.ª edição", rows, ignored, notas: [] };
}

/** Deteta a fonte pelo conteúdo do Excel (não pelo nome do ficheiro). */
export function parseCatalog(sheets: Sheet[], forced?: CatalogSource): ParsedCatalog {
  const src = forced ?? (isInsa(sheets) ? "insa" : tacoSheet(sheets) ? "taco" : null);
  if (src === "insa") return parseInsa(sheets);
  if (src === "taco") return parseTaco(sheets);
  throw new Error("Não reconheci o Excel: use o ficheiro oficial do INSA (PortFIR) ou da TACO (NEPA/UNICAMP).");
}

// ---------------------------------------------------------------------------
// Comparação com o que já está no catálogo
// ---------------------------------------------------------------------------
export type ExistingRow = {
  external_id: number | string;
  name: string;
  grupo: string | null;
  unidade: string | null;
  ativo: boolean;
  kcal_100g: number | string;
  protein_100g: number | string;
  carbs_100g: number | string;
  fat_100g: number | string;
  fiber_100g: number | string;
  sugar_100g: number | string;
};

const FIELDS = ["name", "grupo", "unidade", "kcal_100g", "protein_100g", "carbs_100g", "fat_100g", "fiber_100g", "sugar_100g"] as const;

export type Change = { external_id: number; name: string; campos: { campo: string; antes: string | number | null; depois: string | number | null }[] };

export type CatalogDiff = {
  total: number;
  novos: number;
  alterados: number;
  iguais: number;
  inativados: number;
  reativados: number;
  exemplosNovos: string[];
  exemplosAlterados: Change[];
  exemplosInativados: string[];
  idsAlterados: number[];
  idsInativados: number[];
};

export function diffCatalog(existing: ExistingRow[], incoming: CatalogRow[], max = 8): CatalogDiff {
  const byId = new Map(existing.map((e) => [Number(e.external_id), e]));
  const inIds = new Set(incoming.map((r) => r.external_id));
  const d: CatalogDiff = {
    total: incoming.length,
    novos: 0,
    alterados: 0,
    iguais: 0,
    inativados: 0,
    reativados: 0,
    exemplosNovos: [],
    exemplosAlterados: [],
    exemplosInativados: [],
    idsAlterados: [],
    idsInativados: [],
  };
  for (const r of incoming) {
    const e = byId.get(r.external_id);
    if (!e) {
      d.novos++;
      if (d.exemplosNovos.length < max) d.exemplosNovos.push(r.name);
      continue;
    }
    if (!e.ativo) d.reativados++;
    const campos: Change["campos"] = [];
    for (const f of FIELDS) {
      const a = e[f];
      const b = r[f];
      const same = typeof b === "number" ? Number(a) === b : (a ?? null) === (b ?? null);
      if (!same) campos.push({ campo: f, antes: a == null ? null : typeof b === "number" ? Number(a) : a, depois: b });
    }
    if (campos.length) {
      d.alterados++;
      d.idsAlterados.push(r.external_id);
      if (d.exemplosAlterados.length < max) d.exemplosAlterados.push({ external_id: r.external_id, name: r.name, campos });
    } else d.iguais++;
  }
  for (const e of existing) {
    if (e.ativo && !inIds.has(Number(e.external_id))) {
      d.inativados++;
      d.idsInativados.push(Number(e.external_id));
      if (d.exemplosInativados.length < max) d.exemplosInativados.push(e.name);
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// Pesquisa
// ---------------------------------------------------------------------------
/** Palavras da pesquisa, sem acentos e em minúsculas ("Peito de frango" → ["peito", "frango"]). */
export function searchTerms(q: string): string[] {
  const stop = new Set(["de", "do", "da", "dos", "das", "e", "com", "em", "a", "o"]);
  const words = norm(q)
    .replace(/[%_,;()]/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !stop.has(w));
  return [...new Set(words)].slice(0, 5);
}

const SOURCE_RANK: Record<string, number> = { custom: 0, insa: 1, taco: 2, calorieapi: 3 };

/**
 * Ordena resultados: alimentos próprios, depois INSA, TACO e Calorie API; dentro de cada fonte,
 * primeiro os que começam pela 1.ª palavra pesquisada e os nomes mais curtos (mais genéricos).
 */
export function rankFoods<T extends { name: string; source: string; nome_busca?: string | null }>(foods: T[], q: string): T[] {
  const terms = searchTerms(q);
  const first = terms[0] ?? "";
  const key = (f: T) => {
    const n = f.nome_busca ?? norm(f.name);
    return [SOURCE_RANK[f.source] ?? 9, first && n.startsWith(first) ? 0 : 1, n.length] as const;
  };
  return [...foods].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}
