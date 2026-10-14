"use client";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { removeAvatar, uploadAvatar } from "@/lib/avatar";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";

/** Cabeçalho do Perfil: foto (ou iniciais), nome e email, com enviar/remover foto. */
export function AvatarEditor({
  uid,
  name,
  email,
  src,
  onChange,
}: {
  uid: string;
  name: string | null;
  email: string;
  src: string | null;
  onChange: (url: string | null) => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadAvatar(sb, uid, file));
      toast("Foto atualizada");
    } catch (e) {
      toast((e as Error).message, { kind: "erro" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeAvatar(sb, uid);
      onChange(null);
      toast("Foto removida");
    } catch (e) {
      toast((e as Error).message, { kind: "erro" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="flex items-center gap-4">
      <button
        type="button"
        className="group relative shrink-0 rounded-full focus-visible:outline-2"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={src ? "Alterar foto de perfil" : "Adicionar foto de perfil"}
      >
        <Avatar name={name} email={email} src={src} size={72} className={busy ? "opacity-50" : ""} />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg bg-accent text-on-accent shadow">
          <Icon name="camera" size={15} />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold">{name || "Perfil e metas"}</h1>
        <p className="truncate text-sm text-muted">{email}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
          <button className="font-medium text-accent" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? "A enviar…" : src ? "Alterar foto" : "Adicionar foto"}
          </button>
          {src && !busy && (
            <button className="text-muted hover:text-bad" onClick={remove}>
              Remover
            </button>
          )}
          <span className="text-muted">Sem foto, mostra as iniciais do nome. A imagem é recortada e reduzida para 256×256.</span>
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </header>
  );
}
