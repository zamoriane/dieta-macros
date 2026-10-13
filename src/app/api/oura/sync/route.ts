import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncOura } from "@/lib/oura";

// Chamado pelo app ao abrir (no máximo uma vez por hora, controlado no cliente).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  try {
    const n = await syncOura(user.id, 3);
    return NextResponse.json({ connected: n !== null, days: n ?? 0 });
  } catch (e) {
    return NextResponse.json({ connected: true, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
