import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { apnsConfigured } from "@/lib/victusApns";
import { UUID, validSlots, validStartToken } from "@/lib/victusRemote";

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({}, { status: 403 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const raw = await req.text();
  if (raw.length > 16000) return NextResponse.json({}, { status: 413 });
  let b; try { b = JSON.parse(raw); } catch { return NextResponse.json({}, { status: 400 }); }
  if (!b || !UUID.test(b.installationId ?? "")) return NextResponse.json({}, { status: 400 });
  const admin = createAdminClient();
  // Always accept revocation, even while sending is disabled.
  if (b.enabled === false) {
    const { error } = await admin.from("victus_live_devices").update({ enabled: false, token: null, slots: [] }).eq("user_id", user.id).eq("installation_id", b.installationId);
    return NextResponse.json({ remote: false }, { status: error ? 503 : 200 });
  }
  if (!apnsConfigured()) return NextResponse.json({ remote: false, reason: "not_configured" });
  if (b.enabled !== true || !validStartToken(b.token) || !validSlots(b.slots, Date.now()) || !["pt", "en"].includes(b.locale) ||
      !Number.isInteger(b.goalMl) || b.goalMl < 500 || b.goalMl > 8000 || typeof b.timezone !== "string") return NextResponse.json({}, { status: 400 });
  try { new Intl.DateTimeFormat("en", { timeZone: b.timezone }).format(); } catch { return NextResponse.json({}, { status: 400 }); }
  const { data: p, error: profileError } = await admin.from("profiles").select("ativo").eq("id", user.id).single();
  if (profileError || !p || p.ativo === false) return NextResponse.json({}, { status: 403 });
  // A push token belongs to this app installation. Disable a previous account's registration.
  const revoked = await admin.from("victus_live_devices").update({ enabled: false, token: null, slots: [] }).eq("token", b.token).neq("user_id", user.id);
  if (revoked.error) return NextResponse.json({}, { status: 503 });
  const { error } = await admin.from("victus_live_devices").upsert({ user_id: user.id, installation_id: b.installationId,
    token: b.token, enabled: true, locale: b.locale, timezone: b.timezone, goal_ml: b.goalMl, slots: b.slots,
    last_local_day: typeof b.lastStartedDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.lastStartedDay) ? b.lastStartedDay : null,
    updated_at: new Date().toISOString() }, { onConflict: "user_id,installation_id" });
  return NextResponse.json({ remote: !error }, { status: error ? 503 : 200 });
}
