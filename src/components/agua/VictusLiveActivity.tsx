"use client";
import { useCallback, useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useI18n } from "@/lib/i18n/client";
import { disableVictusRemote, syncVictus } from "@/lib/victusNative";

type Status = { supported: boolean; enabled: boolean; active: boolean; consentVersion?: number; choice?: "unknown" | "accepted" | "later" | "off" };
const bridge = registerPlugin<{
  liveStatus(): Promise<Status>; setLiveConsent(o: { choice: "accepted" | "later" | "off" }): Promise<void>;
}>("Victus");

export function VictusLiveActivity() {
  const { locale } = useI18n();
  const en = locale === "en";
  const [ios, setIos] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [remote, setRemote] = useState(false);
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
    const remoteUpdate = (e: Event) => setRemote((e as CustomEvent).detail === true);
    window.addEventListener("victus-remote-status", remoteUpdate);
    return () => { document.removeEventListener("visibilitychange", update); window.removeEventListener("victus-synced", update); window.removeEventListener("victus-remote-status", remoteUpdate); };
  }, [refresh]);
  async function choose(choice: "accepted" | "later" | "off") {
    setBusy(true); setError(false);
    try {
      if (choice === "accepted") await syncVictus(locale);
      await bridge.setLiveConsent({ choice });
      await refresh();
      if (choice !== "accepted") { setRemote(false); await disableVictusRemote(); }
      else await syncVictus(locale).catch(() => {});
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  if (!ios) return null;
  return <section className="card p-4">
    <h2 className="font-semibold">{en ? "Victus Live Activity" : "Atividade ao Vivo do Victus"}</h2>
    <p className="mt-1 text-sm text-muted">{en ? "Keep your water progress on the Lock Screen and, on compatible iPhones, in the Dynamic Island." : "Acompanhe a água na tela bloqueada e, nos iPhones compatíveis, na Dynamic Island."}</p>
    <p className="mt-2 text-xs text-muted">{en ? "Your choice is saved for this account on this iPhone. With water reminders enabled, Victus can start when you open the app during your reminder hours, once per day. You can turn it off here or in iPhone Settings." : "A escolha fica guardada para esta conta neste iPhone. Com os lembretes de água ativos, o Victus pode iniciar ao abrir a app no horário configurado, uma vez por dia. Pode desativar aqui ou nas Definições do iPhone."}</p>
    <p className="mt-2 text-xs text-muted">{remote ? (en ? "Remote reminders registered for up to three days (iOS 17.2+). Victus may appear at the first scheduled reminder of the day, subject to iOS delivery. Open the app to renew." : "Lembretes remotos registados por até três dias (iOS 17.2+). O Victus pode aparecer no primeiro lembrete agendado do dia, sujeito à entrega pelo iOS. Abra a app para renovar.") : (en ? "Remote start is not registered. Open the app during reminder hours to start Victus." : "O início remoto não está registado. Abra a app no horário dos lembretes para iniciar o Victus.")}</p>
    <p className="mt-2 text-xs text-muted">{en ? "Activities last up to 8 hours. Open the app to sync drinks. Local notifications continue to use your configured intervals." : "As atividades duram até 8 horas. Abra a app para sincronizar bebidas. As notificações locais continuam a usar os intervalos configurados."}</p>
    {status && (!status.supported || !status.consentVersion) && <p className="mt-2 text-sm">{en ? "Update Taking Care. Requires iOS 17 or later." : "Atualize o Taking Care. Requer iOS 17 ou superior."}</p>}
    {status?.supported && !status.enabled && <p className="mt-2 text-sm">{en ? "Enable Live Activities for Taking Care in iPhone Settings." : "Ative as Atividades ao Vivo para o Taking Care nas Definições do iPhone."}</p>}
    {!!status?.consentVersion && <>
      {status.choice === "unknown" && <p className="mt-3 text-sm font-medium">{en ? "Allow Victus to accompany your hydration on the Lock Screen?" : "Permitir que o Victus acompanhe a sua hidratação na tela bloqueada?"}</p>}
      {status.choice === "accepted" && <p role="status" className="mt-2 text-sm">{status.enabled ? (en ? "Victus enabled" : "Victus ativado") : (en ? "Allowed in app · disabled in iPhone Settings" : "Permitido na app · desativado nas Definições do iPhone")}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy || (!status.enabled && status.choice !== "accepted")} onClick={() => void choose(status.choice === "accepted" ? "off" : "accepted")}>
          {busy ? (en ? "Please wait…" : "Aguarde…") : status.choice === "accepted" ? (en ? "Disable Victus" : "Desativar o Victus") : (en ? "Enable Victus" : "Ativar o Victus")}
        </button>
        {status.choice === "unknown" && <button className="btn btn-ghost" disabled={busy} onClick={() => void choose("later")}>{en ? "Not now" : "Agora não"}</button>}
      </div>
    </>}
    {error && <p role="alert" className="mt-2 text-sm">{en ? "Could not save your choice. Open Water with an internet connection and try again." : "Não foi possível guardar a escolha. Abra Água com ligação à internet e tente novamente."}</p>}
  </section>;
}
