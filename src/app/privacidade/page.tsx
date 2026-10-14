export const metadata = { title: "Privacidade · Taking care of yourself" };

export default function Privacidade() {
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
