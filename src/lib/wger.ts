// wger (https://wger.de) — base de exercícios aberta, sem chave. Licença CC BY-SA 3.0:
// é obrigatório mostrar a autoria (license_author) e a licença junto do exercício.
// Este módulo é puro (sem rede) para poder ser testado; a sincronização está na rota /api/exercises.

export const WGER_BASE = "https://wger.de";
export const LANG = { en: 2, es: 4, pt: 7 } as const;

export const CATEGORIES: Record<string, string> = {
  Abs: "Abdominais",
  Arms: "Braços",
  Back: "Costas",
  Calves: "Panturrilhas",
  Cardio: "Cardio",
  Chest: "Peito",
  Legs: "Pernas",
  Shoulders: "Ombros",
};

export const MUSCLES: Record<number, string> = {
  1: "Bíceps",
  2: "Deltoide anterior",
  3: "Serrátil anterior",
  4: "Peitoral",
  5: "Tríceps",
  6: "Reto abdominal",
  7: "Gastrocnémio",
  8: "Glúteo máximo",
  9: "Trapézio",
  10: "Quadríceps",
  11: "Isquiotibiais",
  12: "Grande dorsal",
  13: "Braquial",
  14: "Oblíquos",
  15: "Sóleo",
};

export const EQUIPMENT: Record<string, string> = {
  Barbell: "Barra",
  Bench: "Banco",
  "Cable machine": "Polia",
  Dumbbell: "Halteres",
  "Gym mat": "Colchonete",
  "Incline bench": "Banco inclinado",
  Kettlebell: "Kettlebell",
  "Pull-up bar": "Barra fixa",
  "Resistance band": "Elástico",
  "SZ-Bar": "Barra W",
  "Swiss Ball": "Bola suíça",
  "none (bodyweight exercise)": "Peso corporal",
};

// Termos de ginásio em português → termos em inglês (a maior parte da base só tem nome em inglês).
// Chaves já normalizadas (minúsculas, sem acentos).
export const SYNONYMS: Record<string, string[]> = {
  "levantamento terra": ["deadlift"],
  "elevacao lateral": ["lateral raise"],
  "elevacao frontal": ["front raise"],
  "elevacao pelvica": ["hip thrust", "glute bridge"],
  "cadeira extensora": ["leg extension"],
  "mesa flexora": ["leg curl"],
  "cadeira flexora": ["leg curl"],
  "barra fixa": ["pull up", "pull-up", "chin up"],
  "leg press": ["leg press"],
  "puxada alta": ["pulldown", "pull down"],
  "remada alta": ["upright row"],
  supino: ["bench press", "chest press"],
  agachamento: ["squat"],
  rosca: ["curl"],
  remada: ["row"],
  puxada: ["pulldown", "pull down", "pull-down"],
  desenvolvimento: ["shoulder press", "overhead press", "military press"],
  flexao: ["push up", "push-up", "pushup"],
  prancha: ["plank"],
  afundo: ["lunge"],
  avanco: ["lunge"],
  passada: ["lunge"],
  panturrilha: ["calf"],
  gemeos: ["calf"],
  abdominal: ["crunch", "sit up", "sit-up"],
  crucifixo: ["fly", "flye", "flyes"],
  voador: ["fly", "pec deck", "butterfly"],
  mergulho: ["dip"],
  paralelas: ["dip"],
  stiff: ["romanian deadlift", "stiff"],
  encolhimento: ["shrug"],
  triceps: ["triceps", "tricep"],
  biceps: ["biceps", "bicep"],
  costas: ["back"],
  peito: ["chest"],
  ombro: ["shoulder"],
  ombros: ["shoulder"],
  perna: ["leg"],
  pernas: ["leg"],
  gluteo: ["glute"],
  gluteos: ["glute"],
  halter: ["dumbbell"],
  halteres: ["dumbbell"],
  barra: ["barbell", "bar"],
  polia: ["cable"],
  cabo: ["cable"],
  corrida: ["run"],
  bicicleta: ["bike", "cycling"],
  corda: ["rope", "jump rope"],
  burpee: ["burpee"],
};

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte a pesquisa em grupos de termos: cada grupo tem de bater (E), dentro do grupo basta um (OU). */
export function searchGroups(q: string): string[][] {
  let rest = ` ${norm(q)} `;
  const groups: string[][] = [];
  const phrases = Object.keys(SYNONYMS)
    .filter((k) => k.includes(" "))
    .sort((a, b) => b.length - a.length);
  for (const p of phrases) {
    if (rest.includes(` ${p} `)) {
      groups.push([p, ...SYNONYMS[p]]);
      rest = rest.replace(` ${p} `, " ");
    }
  }
  for (const w of rest.split(" ")) {
    if (w.length < 2) continue;
    groups.push([w, ...(SYNONYMS[w] ?? [])]);
  }
  return groups.map((g) => [...new Set(g)]);
}

/** HTML simples da wger → texto com quebras de linha (nunca renderizamos HTML de terceiros). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|ol|ul)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type MuscleRef = { id: number; nome: string; frente: boolean; sec: boolean; img: string | null };

export type ExerciseRow = {
  id: number;
  nome: string;
  nome_pt: string | null;
  nome_en: string | null;
  categoria: string | null;
  musculos: MuscleRef[];
  equipamento: string[];
  imagem: string | null;
  imagem_thumb: string | null;
  descricao: string | null;
  autor: string | null;
  licenca: string | null;
  busca: string;
  rank: number;
};

type WgerTranslation = { language: number; name: string; description?: string; aliases?: { alias: string }[]; license_author?: string };
type WgerMuscle = { id: number; name: string; name_en?: string; is_front: boolean; image_url_main?: string; image_url_secondary?: string };
export type WgerExerciseInfo = {
  id: number;
  category?: { name: string } | null;
  muscles?: WgerMuscle[];
  muscles_secondary?: WgerMuscle[];
  equipment?: { name: string }[];
  license?: { short_name?: string } | null;
  license_author?: string | null;
  images?: { image: string; is_main: boolean; thumbnails?: { small?: string; medium?: string }; license_author?: string }[];
  translations?: WgerTranslation[];
};

const abs = (u: string | null | undefined) => (!u ? null : u.startsWith("http") ? u : `${WGER_BASE}${u}`);

/** Converte um exerciseinfo da wger numa linha compacta da tabela `exercises`. Devolve null se não tiver nome utilizável. */
export function toExerciseRow(x: WgerExerciseInfo): ExerciseRow | null {
  const tr = x.translations ?? [];
  const pt = tr.find((t) => t.language === LANG.pt && t.name?.trim());
  const en = tr.find((t) => t.language === LANG.en && t.name?.trim());
  const es = tr.find((t) => t.language === LANG.es && t.name?.trim());
  const main = pt ?? en;
  if (!main) return null;

  const muscle = (m: WgerMuscle, sec: boolean): MuscleRef => ({
    id: m.id,
    nome: MUSCLES[m.id] ?? (m.name_en || m.name),
    frente: !!m.is_front,
    sec,
    img: abs(sec ? m.image_url_secondary : m.image_url_main),
  });
  const musculos = [...(x.muscles ?? []).map((m) => muscle(m, false)), ...(x.muscles_secondary ?? []).map((m) => muscle(m, true))];
  const catEn = x.category?.name ?? null;
  const categoria = catEn ? CATEGORIES[catEn] ?? catEn : null;
  const equipamento = (x.equipment ?? []).map((e) => EQUIPMENT[e.name] ?? e.name);
  const img = (x.images ?? []).find((i) => i.is_main) ?? (x.images ?? [])[0];

  // Descrição: português, senão inglês (sem descrição curta demais)
  const descSrc = [pt, en].find((t) => htmlToText(t?.description).length >= 20);
  const descricao = htmlToText(descSrc?.description) || null;
  const autores = [...new Set([descSrc?.license_author ?? main.license_author, x.license_author, img?.license_author].filter((a): a is string => !!a?.trim()))];

  const busca = norm(
    [
      pt?.name,
      en?.name,
      es?.name,
      ...(pt?.aliases ?? []).map((a) => a.alias),
      ...(en?.aliases ?? []).map((a) => a.alias),
      catEn,
      categoria,
      ...musculos.filter((m) => !m.sec).map((m) => m.nome),
      ...(x.equipment ?? []).map((e) => e.name),
      ...equipamento,
    ]
      .filter(Boolean)
      .join(" | "),
  );

  return {
    id: x.id,
    nome: main.name.trim(),
    nome_pt: pt?.name.trim() ?? null,
    nome_en: en?.name.trim() ?? null,
    categoria,
    musculos,
    equipamento,
    imagem: abs(img?.image),
    imagem_thumb: abs(img?.thumbnails?.small ?? img?.image),
    descricao,
    autor: autores.join(", ") || null,
    licenca: x.license?.short_name ?? "CC-BY-SA 3",
    busca,
    rank: (pt ? 0 : 2) + (img ? 0 : 1),
  };
}

export const exerciseUrl = (id: number) => `${WGER_BASE}/exercise/${id}/view/`;
export const BODY_FRONT = `${WGER_BASE}/static/images/muscles/muscular_system_front.svg`;
export const BODY_BACK = `${WGER_BASE}/static/images/muscles/muscular_system_back.svg`;

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Resumo legível dos parâmetros: "4 × 8-10 · 40 kg · 90 s". */
export function prescription(e: { series: number | null; reps: string | null; carga_kg: number | string | null; descanso_s: number | null }): string {
  const parts: string[] = [];
  if (e.series || e.reps) parts.push(`${e.series ?? "?"} × ${e.reps || "?"}`);
  if (e.carga_kg != null && e.carga_kg !== "") parts.push(`${Number(e.carga_kg)} kg`);
  if (e.descanso_s) parts.push(e.descanso_s >= 60 && e.descanso_s % 60 === 0 ? `${e.descanso_s / 60} min` : `${e.descanso_s} s`);
  return parts.join(" · ");
}

/** Primeiro número de "8-12" / "10" / "30 s" para pré-preencher as repetições de uma série. */
export function repsDefault(reps: string | null | undefined): number | null {
  const m = (reps ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
}
