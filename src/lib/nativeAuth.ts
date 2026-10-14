"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./nativeHealthClient";

// Login Google e Apple dentro da app: a Google bloqueia o OAuth em WebViews e a Apple
// tem uma folha nativa. O plugin devolve um idToken que trocamos por sessão no Supabase.
// IDs de cliente OAuth não são segredos; o segredo do cliente web fica só no Supabase.
const WEB_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "498189332281-vnd7thqjnp629fnrh1h49mbn9ucn8n53.apps.googleusercontent.com";
const IOS_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "498189332281-mpq4h0pcgdhlabv6nd476rmh8ucntjfg.apps.googleusercontent.com";

type LoginResult = {
  result?: { idToken?: string | null; profile?: { givenName?: string | null; familyName?: string | null; name?: string | null } | null };
};
type SocialLoginPlugin = {
  initialize(o: {
    google?: { webClientId?: string; iOSClientId?: string; iOSServerClientId?: string; mode?: "online" };
    apple?: Record<string, never>;
  }): Promise<void>;
  login(o: { provider: "google" | "apple"; options: { scopes?: string[]; nonce?: string } }): Promise<LoginResult>;
  logout(o: { provider: "google" | "apple" }): Promise<void>;
};

let plugin: SocialLoginPlugin | null = null;
let ready: Promise<void> | null = null;

function social(): SocialLoginPlugin {
  const p: SocialLoginPlugin = (plugin ??= registerPlugin<SocialLoginPlugin>("SocialLogin"));
  ready ??= p.initialize({
    google: { webClientId: WEB_CLIENT_ID, iOSClientId: IOS_CLIENT_ID, iOSServerClientId: WEB_CLIENT_ID, mode: "online" },
    apple: {}, // no iOS usa o identificador da app automaticamente
  });
  return p;
}

const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

type Provider = "google" | "apple";
type TokenResult = { token: string; nonce?: string; name?: string } | { cancelled: true } | { error: string };

/** Abre o ecrã nativo (Google ou Apple) e devolve o idToken. */
async function nativeIdToken(provider: Provider): Promise<TokenResult> {
  const p = social();
  await ready;
  let nonce: string | undefined;
  let digest: string | undefined;
  if (provider === "google") {
    nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
    digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce)));
  }
  let r: LoginResult;
  try {
    r = await p.login({
      provider,
      options: provider === "google" ? { scopes: ["email", "profile"], nonce: digest } : { scopes: ["name", "email"] },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/cancel|1001/i.test(m)) return { cancelled: true };
    return { error: m };
  }
  const token = r.result?.idToken;
  if (!token) return { error: `${provider}: sem idToken` };
  const pr = r.result?.profile;
  const name = (pr?.name || [pr?.givenName, pr?.familyName].filter(Boolean).join(" ")).trim().slice(0, 80) || undefined;
  return { token, nonce, name };
}

async function forget(provider: Provider) {
  // O SDK da Google pode reutilizar um token antigo (nonce diferente): sair para a próxima tentativa ser limpa.
  if (provider === "google") await social().logout({ provider }).catch(() => {});
}

/** Login nativo (Google ou Apple) e sessão no Supabase. */
export async function nativeSignIn(sb: SupabaseClient, provider: Provider): Promise<{ error: string | null; cancelled?: boolean }> {
  const r = await nativeIdToken(provider);
  if ("cancelled" in r) return { error: null, cancelled: true };
  if ("error" in r) return { error: r.error };
  const { data, error } = await sb.auth.signInWithIdToken({ provider, token: r.token, nonce: r.nonce });
  if (error) {
    await forget(provider);
    return { error: error.message };
  }
  // A Apple só envia o nome no primeiro login: guardá-lo no perfil se ainda estiver vazio.
  if (r.name && data.user) await sb.from("profiles").update({ nome: r.name }).eq("id", data.user.id).is("nome", null);
  return { error: null };
}

/** Liga uma conta Google/Apple à sessão atual (dentro da app). */
export async function nativeLink(sb: SupabaseClient, provider: Provider): Promise<{ error: string | null; cancelled?: boolean }> {
  const r = await nativeIdToken(provider);
  if ("cancelled" in r) return { error: null, cancelled: true };
  if ("error" in r) return { error: r.error };
  const { error } = await sb.auth.linkIdentity({ provider, token: r.token, nonce: r.nonce });
  if (error) {
    await forget(provider);
    return { error: error.message };
  }
  return { error: null };
}
