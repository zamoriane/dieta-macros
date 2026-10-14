import type { MessageKey } from "./core";

/** Mensagens do Supabase Auth (em inglês) → chaves traduzidas. */
export function authErrorKey(msg: string): MessageKey | null {
  if (/invalid login credentials/i.test(msg)) return "auth.err.credenciais";
  if (/email not confirmed/i.test(msg)) return "auth.err.naoConfirmado";
  if (/already registered|already been registered/i.test(msg)) return "auth.err.jaRegistado";
  if (/password should be|at least \d+ characters|weak/i.test(msg)) return "auth.err.passwordFraca";
  if (/rate limit|too many|security purposes/i.test(msg)) return "auth.err.muitosPedidos";
  if (/banned|disabled/i.test(msg)) return "auth.err.contaDesativada";
  return null;
}
