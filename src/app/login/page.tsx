"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const sb = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
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
      <h1 className="text-3xl font-semibold tracking-tight">Dieta Macros</h1>
      <p className="mt-1 text-muted">Calorias, macros e défice do dia, com dados do Oura.</p>
      <form onSubmit={submit} className="mt-8 space-y-3 rounded-2xl border border-line bg-card p-5">
        <input className="w-full" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
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
        <button disabled={busy} className="w-full rounded-xl bg-accent py-2.5 font-medium text-white disabled:opacity-60">
          {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : "Criar conta"}
        </button>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </form>
      <button className="mt-4 text-sm text-accent" onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}>
        {mode === "entrar" ? "Ainda não tem conta? Criar" : "Já tem conta? Entrar"}
      </button>
    </div>
  );
}
