import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/privacidade", "/termos", "/api/cron", "/api/oura/callback", "/api/ingest", "/auth/callback"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC.some((p) => path.startsWith(p))) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Conta desativada pelo admin: bloqueia o app (o banco também recusa os dados via RLS).
  if (user && !PUBLIC.some((p) => path.startsWith(p)) && !path.startsWith("/conta-desativada") && !path.startsWith("/auth/")) {
    const { data: active, error } = await supabase.rpc("is_active");
    if (!error && active === false) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "conta desativada" }, { status: 403 });
      const url = request.nextUrl.clone();
      url.pathname = "/conta-desativada";
      return NextResponse.redirect(url);
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg).*)"],
};
