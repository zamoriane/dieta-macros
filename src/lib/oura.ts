// Integração Oura API v2 via OAuth2. Só corre no servidor.
// Os refresh tokens do Oura são de uso único: guardar SEMPRE o novo depois de renovar.
import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

// Endereço recomendado pelo Oura para clientes novos (abre a app Oura no telemóvel quando disponível)
const AUTH_URL = "https://developer.ouraring.com/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const API = "https://api.ouraring.com/v2/usercollection";
export const OURA_SCOPES = "personal daily stress heartrate workout session spo2";

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.OURA_CLIENT_ID!,
    redirect_uri: process.env.OURA_REDIRECT_URI!,
    scope: OURA_SCOPES,
    state,
  });
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...body,
      client_id: process.env.OURA_CLIENT_ID!,
      client_secret: process.env.OURA_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) throw new Error(`Oura token ${res.status}: ${await res.text()}`);
  return res.json();
}

async function saveTokens(userId: string, t: TokenResponse) {
  const admin = createAdminClient();
  const { error } = await admin.from("oura_tokens").upsert({
    user_id: userId,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    atualizado_em: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function exchangeCode(userId: string, code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: process.env.OURA_REDIRECT_URI! });
  await saveTokens(userId, t);
}

async function validAccessToken(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("oura_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() > Date.now()) return data.access_token;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await saveTokens(userId, t);
  return t.access_token;
}

async function get<T>(token: string, path: string, start: string, end: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  do {
    const q = new URLSearchParams({ start_date: start, end_date: end });
    if (next) q.set("next_token", next);
    const res = await fetch(`${API}/${path}?${q}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`Oura ${path} ${res.status}`);
    const j = (await res.json()) as { data: T[]; next_token?: string | null };
    out.push(...j.data);
    next = j.next_token ?? null;
  } while (next);
  return out;
}

type Activity = { day: string; active_calories?: number; total_calories?: number; steps?: number };
type Scored = { day: string; score?: number | null };
type Stress = { day: string; stress_high?: number | null; recovery_high?: number | null; day_summary?: string | null };

/** Sincroniza os últimos `days` dias para oura_daily. Devolve o nº de dias gravados, ou null se não houver ligação. */
export async function syncOura(userId: string, days = 7): Promise<number | null> {
  const token = await validAccessToken(userId);
  if (!token) return null;

  const end = new Date();
  end.setDate(end.getDate() + 1); // end_date é exclusivo em algumas coleções
  const start = new Date();
  start.setDate(start.getDate() - days);
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);

  const [activity, sleep, readiness, stress] = await Promise.all([
    get<Activity>(token, "daily_activity", s, e),
    get<Scored>(token, "daily_sleep", s, e),
    get<Scored>(token, "daily_readiness", s, e),
    get<Stress>(token, "daily_stress", s, e).catch(() => [] as Stress[]),
  ]);

  const byDay = new Map<string, Record<string, unknown>>();
  const row = (day: string) => {
    if (!byDay.has(day)) byDay.set(day, { user_id: userId, dia: day, raw: {} });
    return byDay.get(day)!;
  };
  for (const a of activity) {
    Object.assign(row(a.day), { active_calories: a.active_calories ?? null, total_calories: a.total_calories ?? null, steps: a.steps ?? null });
    (row(a.day).raw as Record<string, unknown>).activity = a;
  }
  for (const x of sleep) {
    row(x.day).sleep_score = x.score ?? null;
    (row(x.day).raw as Record<string, unknown>).sleep = x;
  }
  for (const x of readiness) {
    row(x.day).readiness_score = x.score ?? null;
    (row(x.day).raw as Record<string, unknown>).readiness = x;
  }
  for (const x of stress) {
    Object.assign(row(x.day), {
      stress_high_min: x.stress_high != null ? Math.round(x.stress_high / 60) : null,
      recovery_high_min: x.recovery_high != null ? Math.round(x.recovery_high / 60) : null,
      stress_summary: x.day_summary ?? null,
    });
    (row(x.day).raw as Record<string, unknown>).stress = x;
  }

  const rows = [...byDay.values()].map((r) => ({ ...r, atualizado_em: new Date().toISOString() }));
  if (rows.length) {
    const { error } = await createAdminClient().from("oura_daily").upsert(rows);
    if (error) throw error;
  }
  return rows.length;
}
