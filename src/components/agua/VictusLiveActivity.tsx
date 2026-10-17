"use client";
import { useCallback, useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useI18n } from "@/lib/i18n/client";
import { syncVictus } from "@/lib/victusNative";

type Status = { supported: boolean; enabled: boolean; active: boolean };
const bridge = registerPlugin<{
  liveStatus(): Promise<Status>; startLive(): Promise<void>; stopLive(): Promise<void>;
}>("Victus");

export function VictusLiveActivity() {
  const { locale } = useI18n();
  const en = locale === "en";
  const [ios, setIos] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try { setStatus(await bridge.liveStatus()); }
    catch { setStatus({ supported: false, enabled: false, active: false }); }
  }, []);
  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    setIos(true); void refresh();
    const update = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", update);
    window.addEventListener("victus-synced", update);
    return () => { document.removeEventListener("visibilitychange", update); window.removeEventListener("victus-synced", update); };
  }, [refresh]);
  if (!ios) return null;
  return <section className="card p-4">
    <h2 className="font-semibold">{en ? "Victus Live Activity" : "Atividade ao Vivo do Victus"}</h2>
    <p className="mt-1 text-sm text-muted">{en ? "Keep your water progress on the Lock Screen and, on compatible iPhones, in the Dynamic Island." : "Acompanhe a água na tela bloqueada e, nos iPhones compatíveis, na Dynamic Island."}</p>
    <p className="mt-2 text-xs text-muted">{en ? "Start with the app open. Lasts up to 8 hours, ends on goal completion when updated, and becomes stale at midnight. Open the app to sync drinks. Scheduled reminders remain notifications." : "Inicie com a app aberta. Dura até 8 horas, termina ao atualizar a meta atingida e fica desatualizada à meia-noite. Abra a app para sincronizar bebidas. Os lembretes agendados continuam a ser notificações."}</p>
    {status && !status.supported && <p className="mt-2 text-sm">{en ? "Update Taking Care. Requires iOS 17 or later." : "Atualize o Taking Care. Requer iOS 17 ou superior."}</p>}
    {status?.supported && !status.enabled && <p className="mt-2 text-sm">{en ? "Enable Live Activities for Taking Care in iPhone Settings." : "Ative as Atividades ao Vivo para o Taking Care nas Definições do iPhone."}</p>}
    {status?.supported && <button className="btn btn-primary mt-3" disabled={busy || (!status.enabled && !status.active)} onClick={async () => {
      setBusy(true); setError(false);
      try {
        if (status.active) await bridge.stopLive();
        else { await syncVictus(locale); await bridge.startLive(); }
        await refresh();
      } catch { setError(true); }
      finally { setBusy(false); }
    }}>{busy ? (en ? "Please wait…" : "Aguarde…") : status.active ? (en ? "End Live Activity" : "Terminar Atividade ao Vivo") : (en ? "Start Live Activity" : "Iniciar Atividade ao Vivo")}</button>}
    {error && <p role="alert" className="mt-2 text-sm">{en ? "Could not change the Live Activity. Check your connection, permissions and today's goal (it must still be incomplete), then try again." : "Não foi possível alterar a Atividade ao Vivo. Verifique a ligação, as permissões e a meta de hoje (ainda deve estar por cumprir) e tente novamente."}</p>}
  </section>;
}
