"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageKey } from "@/lib/i18n/core";

type Tr = (k: MessageKey) => string;

export const AVATAR_PX = 256;
export const AVATAR_MAX_INPUT = 15 * 1024 * 1024; // ficheiro original até 15 MB (é reduzido antes de enviar)

/** Recorta ao centro em quadrado e reduz para 256×256 WebP (≈ 20–40 KB). */
export async function resizeAvatar(file: File, t: Tr): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error(t("avatar.err.tipo"));
  if (file.size > AVATAR_MAX_INPUT) throw new Error(t("avatar.err.grande"));
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => {
    throw new Error(t("avatar.err.ler"));
  });
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2;
  const sy = (bmp.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  // Safari antigo não gera WebP: cai para JPEG
  if (blob && blob.type === "image/webp") return blob;
  const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!jpg) throw new Error(t("avatar.err.processar"));
  return jpg;
}

/** Envia o avatar para avatars/<uid>/, grava o URL no perfil e apaga as versões anteriores. */
export async function uploadAvatar(sb: SupabaseClient, uid: string, file: File, t: Tr): Promise<string> {
  const blob = await resizeAvatar(file, t);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/avatar-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error: e2 } = await sb.from("profiles").update({ avatar_url: url }).eq("id", uid);
  if (e2) throw new Error(e2.message);
  await cleanup(sb, uid, path);
  return url;
}

export async function removeAvatar(sb: SupabaseClient, uid: string): Promise<void> {
  const { error } = await sb.from("profiles").update({ avatar_url: null }).eq("id", uid);
  if (error) throw new Error(error.message);
  await cleanup(sb, uid, null);
}

async function cleanup(sb: SupabaseClient, uid: string, keep: string | null) {
  const { data } = await sb.storage.from("avatars").list(uid);
  const old = (data ?? []).map((f) => `${uid}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await sb.storage.from("avatars").remove(old);
}

/** Avisa a barra de navegação de que o nome/foto mudaram. */
export function notifyProfileChanged() {
  window.dispatchEvent(new Event("perfil-atualizado"));
}
