import { serverLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const l = await serverLocale();
  return { title: `${l === "en" ? "Terms" : "Termos"} · Taking care of yourself` };
}

export default async function Termos() {
  const l = await serverLocale();
  if (l === "en") {
    return (
      <article className="space-y-3 text-sm leading-relaxed">
        <h1 className="text-xl font-semibold">Terms of use</h1>
        <p>Taking care of yourself is a personal tool for tracking food and activity, provided as is.</p>
        <p>
          Calorie, macronutrient, energy expenditure and deficit figures are estimates based on food databases, published formulas and device data,
          and do not replace advice from a doctor or nutritionist.
        </p>
        <p>Users are responsible for the data they log and for connecting external services such as Oura.</p>
      </article>
    );
  }
  return (
    <article className="space-y-3 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold">Termos de utilização</h1>
      <p>A Taking care of yourself é uma ferramenta pessoal de acompanhamento de alimentação e atividade, fornecida tal como está.</p>
      <p>
        Os valores de calorias, macronutrientes, gasto energético e défice são estimativas baseadas em bases de dados de alimentos, fórmulas
        publicadas e dados de dispositivos, e não substituem aconselhamento médico ou de um nutricionista.
      </p>
      <p>O utilizador é responsável pelos dados que regista e pela ligação de serviços externos como o Oura.</p>
    </article>
  );
}
