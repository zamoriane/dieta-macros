import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/oura";

export async function GET() {
  if (!process.env.OURA_CLIENT_ID) {
    return NextResponse.json({ error: "Oura não configurado (OURA_CLIENT_ID)" }, { status: 500 });
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("oura_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
