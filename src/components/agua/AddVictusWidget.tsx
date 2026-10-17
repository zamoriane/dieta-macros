"use client";
import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useI18n } from "@/lib/i18n/client";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { hasVictusWidget, syncVictus } from "@/lib/victusNative";

export function AddVictusWidget() {
  const { t, locale } = useI18n();
  const [platform, setPlatform] = useState("web");
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  useEffect(() => { setPlatform(Capacitor.getPlatform()); setAvailable(hasVictusWidget()); }, []);
  if (platform === "web") return null;
  return <section className="card p-4">
    <h2 className="font-semibold">{t("victus.widgetTitle")}</h2>
    <p className="mt-1 text-sm text-muted">{t("victus.widgetSummary")}</p>
    <p className="mt-1 text-xs text-muted">{t("victus.pendingInfo")}</p>
    <button className="btn btn-primary mt-3" disabled={busy} onClick={async () => {
      if (!available || platform === "ios") { setOpen(true); return; }
      setBusy(true);
      try {
        await syncVictus(locale);
        const result = await registerPlugin<{ requestPin(): Promise<{ supported: boolean }> }>("Victus").requestPin();
        setRequested(result.supported); setOpen(true);
      } catch { setRequested(false); setOpen(true); }
      finally { setBusy(false); }
    }}>{t("victus.addWidget")}</button>
    <ResponsiveDialog open={open} onClose={() => setOpen(false)} title={t("victus.addWidget")}>
      <p className="text-sm">{!available ? t("victus.updateApp") : requested ? t("victus.pinRequested") : platform === "ios" ? t("victus.iosSteps") : t("victus.androidSteps")}</p>
    </ResponsiveDialog>
  </section>;
}
