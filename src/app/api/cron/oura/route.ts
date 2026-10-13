import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncOura } from "@/lib/oura";

// Executado diariamente pela Vercel (vercel.json). A Vercel envia "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const { data: users } = await createAdminClient().from("oura_tokens").select("user_id");
  const results: Record<string, string> = {};
  for (const u of users ?? []) {
    try {
      results[u.user_id] = `${await syncOura(u.user_id, 3)} dias`;
    } catch (e) {
      results[u.user_id] = `erro: ${e instanceof Error ? e.message : e}`;
    }
  }
  return NextResponse.json({ ok: true, results });
}
