"use client";
import { clearVictus } from "@/lib/victusNative";
import { useState } from "react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { FormField } from "@/components/ui/Primitives";
import { useI18n } from "@/lib/i18n/client";

/** Apagar a conta e todos os dados, com confirmação escrevendo o email. */
export function DeleteAccount({ email }: { email: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = confirm.trim().toLowerCase() === email.toLowerCase() && !!email;

  async function run() {
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? t("comum.erro"));
    await clearVictus(true).catch(() => {});
    window.location.href = "/login?conta=apagada";
  }

  return (
    <>
      <button className="btn btn-ghost !text-bad" onClick={() => setOpen(true)}>
        {t("apagar.botao")}
      </button>
      <ResponsiveDialog
        open={open}
        title={t("apagar.titulo")}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>
              {t("comum.cancelar")}
            </button>
            <button className="btn flex-1 bg-bad text-white disabled:opacity-50" disabled={!ok || busy} onClick={run}>
              {busy ? t("apagar.aApagar") : t("apagar.confirmar")}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>{t("apagar.explica")}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>{t("apagar.item1")}</li>
            <li>{t("apagar.item2")}</li>
            <li>{t("apagar.item3")}</li>
          </ul>
          <p className="font-medium text-bad">{t("apagar.irreversivel")}</p>
          <FormField label={t("apagar.escreva", { email })}>
            <input className="w-full" type="email" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </FormField>
          {error && <p className="rounded-lg bg-bad/10 p-3 text-bad">{error}</p>}
        </div>
      </ResponsiveDialog>
    </>
  );
}
