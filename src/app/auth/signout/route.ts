import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }); // só este dispositivo; "global" terminava as sessões em todos
  return NextResponse.redirect(new URL("/login", req.nextUrl.origin), { status: 303 });
}
