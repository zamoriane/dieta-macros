import { serverLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const l = await serverLocale();
  return { title: `${l === "en" ? "Privacy" : "Privacidade"} · Taking care of yourself` };
}

export default async function Privacidade() {
  const l = await serverLocale();
  if (l === "en") {
    return (
      <article className="space-y-3 text-sm leading-relaxed">
        <h1 className="text-xl font-semibold">Privacy policy</h1>
        <p>Taking care of yourself is a personal app for logging food, weight and activity data.</p>
        <p>
          Data stored: sign-in email, profile (sex, date of birth, height, goals), food and weight logs and, if you connect an Oura account, daily
          summaries of activity, sleep, readiness and stress.
        </p>
        <p>
          Data is kept in a Supabase database in the European Union (Frankfurt), protected by per-user access rules. It is not sold or shared with
          third parties. Oura access tokens are kept on the server only.
        </p>
        <p>You can ask for your account and all data to be deleted at any time via the app owner&apos;s contact email.</p>
        <p>You can revoke Oura access in your Oura account settings.</p>
      </article>
    );
  }
  return (
    <article className="space-y-3 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold">Política de privacidade</h1>
      <p>A Taking care of yourself é uma aplicação pessoal para registo de alimentação, peso e dados de atividade.</p>
      <p>
        Dados guardados: email de acesso, perfil (sexo, data de nascimento, altura, metas), registos de alimentação e peso e, se ligar a
        conta Oura, os resumos diários de atividade, sono, prontidão e stress.
      </p>
      <p>
        Os dados ficam numa base de dados Supabase na União Europeia (Frankfurt), protegidos por regras de acesso por utilizador. Não são
        vendidos nem partilhados com terceiros. Os tokens de acesso ao Oura ficam apenas no servidor.
      </p>
      <p>Pode pedir a remoção da sua conta e de todos os dados a qualquer momento através do email de contacto do responsável pela aplicação.</p>
      <p>Pode revogar o acesso ao Oura nas definições da sua conta Oura.</p>
    </article>
  );
}
