import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, syncOura } from "@/lib/oura";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const back = (status: string) => NextResponse.redirect(new URL(`/perfil?oura=${status}`, url.origin));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code) return back("cancelado");
  if (!state || state !== req.cookies.get("oura_state")?.value) return back("estado-invalido");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  try {
    await exchangeCode(user.id, code);
    await syncOura(user.id, 30);
  } catch (e) {
    console.error(e);
    return back("erro");
  }
  const res = back("ok");
  res.cookies.delete("oura_state");
  return res;
}
