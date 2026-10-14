"use client";
import { useEffect, useState } from "react";
import { connectHealth, isHealthConnected, isNativeApp, nativePlatform, syncHealth } from "@/lib/nativeHealthClient";
import { useI18n } from "@/lib/i18n/client";
import { toast } from "@/components/ui/Toast";

/** Só aparece dentro da app nativa: ligar a Apple Saúde (iPhone) ou o Health Connect (Android). */
export function NativeHealthCard({ onConnected }: { onConnected: () => void }) {
  const { t } = useI18n();
  const [native, setNative] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNative(isNativeApp());
    setConnected(isHealthConnected());
  }, []);

  if (!native) return null;
  const name = nativePlatform() === "android" ? "Health Connect" : t("saude.appleSaude");

  async function connect() {
    setBusy(true);
    try {
      const r = await connectHealth();
      if (!r.ok) {
        toast(t("saude.indisponivel", { nome: name }), { kind: "erro" });
        return;
      }
      setConnected(true);
      const n = await syncHealth(30);
      toast(t("saude.sincronizado", { n }));
      onConnected();
    } catch (e) {
      toast((e as Error).message, { kind: "erro" });
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    try {
      const n = await syncHealth(7);
      toast(t("saude.sincronizado", { n }));
      onConnected();
    } catch (e) {
      toast((e as Error).message, { kind: "erro" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div>
        <h2 className="font-medium">{name}</h2>
        <p className="text-xs text-muted">{t("saude.dica", { nome: name })}</p>
      </div>
      {connected ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-good">{t("saude.ligado")}</span>
          <button className="btn btn-ghost !min-h-10" disabled={busy} onClick={sync}>
            {busy ? t("comum.aguarde") : t("saude.sincronizar")}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" disabled={busy} onClick={connect}>
          {busy ? t("comum.aguarde") : t("saude.ligar", { nome: name })}
        </button>
      )}
    </section>
  );
}
