"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  const cap = (window as unknown as { Capacitor: { registerPlugin: <T>(n: string) => T } }).Capacitor;
  plugin ??= cap.registerPlugin<SocialLoginPlugin>("SocialLogin");
  ready ??= plugin.initialize({
    google: { webClientId: WEB_CLIENT_ID, iOSClientId: IOS_CLIENT_ID, iOSServerClientId: WEB_CLIENT_ID, mode: "online" },
    apple: {}, // no iOS usa o identificador da app automaticamente
  });
  return plugin;
}

const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Abre o ecrã nativo da Google e inicia sessão no Supabase. Devolve null se o utilizador cancelar. */
export async function nativeGoogleSignIn(sb: SupabaseClient): Promise<{ error: string | null; cancelled?: boolean }> {
  const p = social();
  await ready;
  const rawNonce = hex(crypto.getRandomValues(new Uint8Array(32)));
  const nonceDigest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce)));

  let idToken: string | null | undefined;
  try {
    const r = await p.login({ provider: "google", options: { scopes: ["email", "profile"], nonce: nonceDigest } });
    idToken = r.result?.idToken;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(m)) return { error: null, cancelled: true };
    return { error: m };
  }
  if (!idToken) return { error: "Google: sem idToken" };

  const { error } = await sb.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: rawNonce });
  if (error) {
    // O SDK da Google pode reutilizar um token antigo (nonce diferente): sair e deixar tentar de novo.
    await p.logout({ provider: "google" }).catch(() => {});
    return { error: error.message };
  }
  return { error: null };
}

/** Folha nativa "Iniciar sessão com a Apple" (iOS) e sessão no Supabase. */
export async function nativeAppleSignIn(sb: SupabaseClient): Promise<{ error: string | null; cancelled?: boolean }> {
  const p = social();
  await ready;
  let r: LoginResult;
  try {
    r = await p.login({ provider: "apple", options: { scopes: ["name", "email"] } });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/cancel|1001/i.test(m)) return { error: null, cancelled: true };
    return { error: m };
  }
  const idToken = r.result?.idToken;
  if (!idToken) return { error: "Apple: sem idToken" };
  const { data, error } = await sb.auth.signInWithIdToken({ provider: "apple", token: idToken });
  if (error) return { error: error.message };

  // A Apple só envia o nome no primeiro login: guardá-lo no perfil se ainda estiver vazio.
  const pr = r.result?.profile;
  const nome = (pr?.name || [pr?.givenName, pr?.familyName].filter(Boolean).join(" ")).trim().slice(0, 80);
  if (nome && data.user) {
    await sb.from("profiles").update({ nome }).eq("id", data.user.id).is("nome", null);
  }
  return { error: null };
}
