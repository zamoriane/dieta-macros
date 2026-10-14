"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FormField, PageHeader } from "@/components/ui/Primitives";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";

/** Definir uma palavra-passe nova (vindo do Perfil ou do link "Esqueceu a palavra-passe?"). */
export default function NovaSenhaPage() {
  const { t } = useI18n();
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
          ? t("senha.err.igual")
          : /reauthentication|recent login/i.test(m)
            ? t("senha.err.reautenticar")
            : /weak|least/i.test(m)
              ? t("senha.err.fraca")
              : m,
      );
    }
    toast(t("senha.alterada"));
    router.replace("/perfil");
  }

  return (
    <div className="mx-auto max-w-md space-y-5 pt-2">
      <PageHeader title={t("senha.titulo")} subtitle={email ? t("senha.conta", { email }) : undefined} />
      <form onSubmit={save} className="card space-y-4 p-5">
        {/* campo oculto para os gestores de palavras-passe associarem ao email certo */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <FormField label={t("senha.nova")} error={tooShort ? t("senha.err.minimo") : null}>
          <input className="w-full" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required data-autofocus />
        </FormField>
        <FormField label={t("senha.repetir")} error={mismatch ? t("senha.err.diferentes") : null}>
          <input className="w-full" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        </FormField>
        {error && <p className="rounded-lg bg-bad/10 p-3 text-sm text-bad">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={() => router.back()}>
            {t("comum.cancelar")}
          </button>
          <button className="btn btn-primary flex-1" disabled={!valid || busy}>
            {busy ? t("comum.aGuardar") : t("comum.guardar")}
          </button>
        </div>
      </form>
    </div>
  );
}
