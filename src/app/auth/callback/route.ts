import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Destino dos links enviados por email (recuperar palavra-passe, confirmar conta) e do login/ligação Google e Apple.
// Troca o código do link por uma sessão e segue para `next` (só caminhos internos).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const nextParam = sp.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const supabase = await createClient();

  const code = sp.get("code");
  const tokenHash = sp.get("token_hash");
  const type = sp.get("type") as EmailOtpType | null;

  // Falha ao ligar uma conta (já com sessão): voltar à página de origem com o motivo.
  const providerError = sp.get("error_description") ?? sp.get("error");
  if (providerError && !code && next !== "/") {
    const url = new URL(next, req.nextUrl.origin);
    url.searchParams.set("ligacao_erro", providerError.slice(0, 200));
    return NextResponse.redirect(url);
  }

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Link sem código") };

  if (error) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("erro", "link");
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL(next, req.nextUrl.origin));
}
