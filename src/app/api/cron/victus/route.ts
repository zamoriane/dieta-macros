import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { apnsConfigured, sendVictusStart } from "@/lib/victusApns";
import { dueSlot, liveStartPayload, localClock, type LiveSlot } from "@/lib/victusRemote";
import { parseConfig } from "@/lib/water";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({}, { status: 401 });
  if (!apnsConfigured()) return NextResponse.json({ enabled: false }, { status: 503 });
  const db = createAdminClient(), now = Date.now();
  const { data: devices, error } = await db.from("victus_live_devices").select("*").eq("enabled", true).gt("updated_at", new Date(now - 3 * 86400_000).toISOString());
  if (error) return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  let accepted = 0, failed = 0, attempted = 0;
  for (const d of devices ?? []) {
    const slot = dueSlot(d.slots as LiveSlot[], now);
    if (!slot || !d.token || d.last_local_day === slot.day) continue;
    const { data: profile, error: pe } = await db.from("profiles").select("agua,ativo").eq("id", d.user_id).single();
    if (pe || !profile || profile.ativo === false) continue;
    const cfg = parseConfig(profile.agua), clock = localClock(new Date(now), d.timezone);
    const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    if (!cfg.lembretes.ativo || clock.day !== slot.day || !cfg.lembretes.dias.includes(clock.weekday) || clock.minute < minutes(cfg.lembretes.inicio) || clock.minute > minutes(cfg.lembretes.fim)) continue;
    const { data: logs, error: le } = await db.from("water_logs").select("ml,fator,hora").eq("user_id", d.user_id).eq("dia", slot.day);
    if (le) continue;
    const goal = cfg.meta_ml ?? d.goal_ml;
    if ((logs ?? []).reduce((sum, l) => sum + Math.round(l.ml * l.fator), 0) >= goal) continue;
    if ((logs ?? []).some(l => now - Date.parse(l.hora) < cfg.lembretes.intervalo * 60_000)) continue;
    const { data: claimed, error: ce } = await db.rpc("claim_victus_live", { p_user: d.user_id, p_installation: d.installation_id, p_day: slot.day });
    if (ce || !claimed) continue;
    attempted++;
    try {
      const status = await sendVictusStart(d.token, liveStartPayload({ owner: d.user_id, slot, now, en: d.locale === "en", goal }));
      if (status === 200) accepted++; else failed++;
      if (status === 410 || status === 400) await db.from("victus_live_devices").update({ enabled: false, token: null }).eq("user_id", d.user_id).eq("installation_id", d.installation_id).eq("token", d.token);
    } catch { failed++; }
    // At-most-once per device/day, including ambiguous network failures. Never retry a possibly accepted start.
    if (attempted >= 5) break;
  }
  return NextResponse.json({ accepted, failed, attempted });
}
