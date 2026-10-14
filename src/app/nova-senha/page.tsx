"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FormField, PageHeader } from "@/components/ui/Primitives";
import { toast } from "@/components/ui/Toast";

/** Definir uma palavra-passe nova (vindo do Perfil ou do link "Esqueceu a palavra-passe?"). */
export default function NovaSenhaPage() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, [sb]);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const valid = pw.length >= 8 && pw === pw2;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      const m = error.message;
      return setError(
        /different from the old/i.test(m)
          ? "A nova palavra-passe tem de ser diferente da atual."
          : /reauthentication|recent login/i.test(m)
            ? "Por segurança, saia e entre de novo antes de alterar a palavra-passe."
            : /weak|least/i.test(m)
              ? "Palavra-passe demasiado fraca. Use pelo menos 8 caracteres, misturando letras e números."
              : m,
      );
    }
    toast("Palavra-passe alterada");
    router.replace("/perfil");
  }

  return (
    <div className="mx-auto max-w-md space-y-5 pt-2">
      <PageHeader title="Nova palavra-passe" subtitle={email ? `Conta ${email}` : undefined} />
      <form onSubmit={save} className="card space-y-4 p-5">
        {/* campo oculto para os gestores de palavras-passe associarem ao email certo */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <FormField label="Nova palavra-passe" error={tooShort ? "Mínimo de 8 caracteres." : null}>
          <input className="w-full" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required data-autofocus />
        </FormField>
        <FormField label="Repetir a palavra-passe" error={mismatch ? "As palavras-passe não coincidem." : null}>
          <input className="w-full" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        </FormField>
        {error && <p className="rounded-lg bg-bad/10 p-3 text-sm text-bad">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={() => router.back()}>
            Cancelar
          </button>
          <button className="btn btn-primary flex-1" disabled={!valid || busy}>
            {busy ? "A guardar…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
