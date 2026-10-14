"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const sb = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar" | "recuperar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("erro") === "link")
      setMsg("O link expirou ou já foi usado. Peça um novo em “Esqueceu a palavra-passe?”.");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "recuperar") {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/nova-senha` });
      setBusy(false);
      // Mesma mensagem com ou sem conta, para não revelar que emails estão registados
      if (error && !/rate|limit/i.test(error.message)) return setMsg(error.message);
      if (error) return setMsg("Muitos pedidos seguidos. Aguarde um minuto e tente de novo.");
      return setMsg("Se existir uma conta com este email, enviámos um link para definir uma nova palavra-passe. Veja também o spam.");
    }
    const { error, data } =
      mode === "entrar"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/` } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "criar" && !data.session) return setMsg("Conta criada. Confirme o email que enviámos e depois entre.");
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-3xl font-semibold tracking-tight">Taking care of yourself</h1>
      <p className="mt-1 text-muted">Calorias, macros, exercícios e défice do dia, com dados do Oura e Apple.</p>
      <form onSubmit={submit} className="mt-8 space-y-3 rounded-2xl border border-line bg-card p-5">
        <input className="w-full" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        {mode !== "recuperar" && (
        <input
          className="w-full"
          type="password"
          placeholder="Palavra-passe (mín. 8)"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={mode === "entrar" ? "current-password" : "new-password"}
        />
        )}
        <button disabled={busy} className="w-full rounded-xl bg-accent py-2.5 font-medium text-on-accent disabled:opacity-60">
          {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link de recuperação"}
        </button>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm">
        <button className="text-accent" onClick={() => { setMode(mode === "entrar" ? "criar" : "entrar"); setMsg(null); }}>
          {mode === "entrar" ? "Ainda não tem conta? Criar" : "Já tem conta? Entrar"}
        </button>
        {mode === "entrar" && (
          <button className="text-muted hover:text-ink" onClick={() => { setMode("recuperar"); setMsg(null); }}>
            Esqueceu a palavra-passe?
          </button>
        )}
      </div>
    </div>
  );
}
