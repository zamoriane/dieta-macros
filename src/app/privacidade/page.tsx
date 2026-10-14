import { serverLocale } from "@/lib/i18n/server";

// Email de contacto do responsável: definir NEXT_PUBLIC_CONTACT_EMAIL na Vercel.
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const UPDATED = "2026-10-14";

type Section = { h: string; p?: string[]; li?: string[] };

const PT: { title: string; intro: string; sections: Section[] } = {
  title: "Política de privacidade",
  intro:
    "A Taking care of yourself ajuda a registar alimentação, peso, medidas, treino e atividade. Esta política explica que dados guardamos, para quê, com quem são partilhados e como os pode apagar.",
  sections: [
    {
      h: "Dados que guardamos",
      li: [
        "Conta: email, palavra-passe (guardada cifrada pelo Supabase Auth), idioma e, se escolher, nome e foto de perfil.",
        "Se entrar com Google: recebemos apenas o seu email, nome e um identificador da conta Google. Não acedemos a mais nada da sua conta Google.",
        "Perfil: sexo, data de nascimento, altura, metas e fatores de cálculo.",
        "Registos: alimentos e quantidades, peso, medidas corporais (cintura, anca, pescoço e outras), plano alimentar, plano de treino e séries feitas.",
        "Oura (se ligar): resumos diários de atividade, calorias, passos, sono, prontidão e stress.",
        "Apple Saúde via Health Auto Export (se configurar): calorias ativas e basais, passos, minutos de exercício, sono, frequência cardíaca em repouso, variabilidade cardíaca, peso e treinos, incluindo o percurso GPS dos treinos ao ar livre.",
        "Registos técnicos mínimos (ex.: data do último envio do iPhone) para diagnosticar problemas.",
      ],
    },
    {
      h: "Para que usamos",
      li: [
        "Calcular calorias, macronutrientes, gasto energético, défice e indicadores (relação cintura/altura, gordura estimada).",
        "Mostrar o seu progresso e, se autorizar, partilhá-lo com o seu treinador.",
        "Não usamos os dados para publicidade, não os vendemos e não criamos perfis para terceiros.",
      ],
    },
    {
      h: "Base legal",
      p: [
        "Os dados de saúde (peso, medidas, sono, frequência cardíaca, treinos) são tratados com o seu consentimento explícito, dado ao criar a conta e ao ligar cada integração. Pode retirá-lo a qualquer momento desligando a integração ou apagando a conta.",
      ],
    },
    {
      h: "Partilha com treinadores",
      p: [
        "Um treinador só vê os seus dados se se ligar a ele com o código dele, e apenas o que autorizar: plano alimentar, progresso (registos, peso, medidas, atividade) e/ou plano de treino. Pode alterar as permissões ou terminar a ligação em Perfil → O meu treinador.",
      ],
    },
    {
      h: "Serviços que usamos",
      li: [
        "Supabase — base de dados, autenticação e fotos, na União Europeia (Frankfurt).",
        "Google — só se escolher entrar com Google, para confirmar a sua identidade.",
        "Vercel — alojamento da aplicação; os pedidos podem passar por servidores fora da UE.",
        "Calorie API — recebe apenas os termos que pesquisa para encontrar alimentos.",
        "wger — catálogo público de exercícios; não recebe dados seus.",
        "Oura — só se ligar a conta; os tokens de acesso ficam apenas no servidor.",
        "OpenStreetMap — mostra o mapa dos percursos; o seu navegador descarrega as imagens do mapa.",
      ],
    },
    {
      h: "Quanto tempo guardamos",
      p: ["Enquanto a conta existir. Ao apagar a conta, todos os dados e fotos são apagados de imediato e não podem ser recuperados."],
    },
    {
      h: "Os seus direitos",
      li: [
        "Apagar a conta e todos os dados: Perfil → Conta e segurança → Apagar conta.",
        "Corrigir dados: diretamente no Perfil e nos registos.",
        "Aceder ou levar os seus dados, opor-se ou limitar o tratamento: pelo email de contacto abaixo.",
        "Apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD), em Portugal, ou à autoridade do seu país.",
      ],
    },
    {
      h: "Aviso",
      p: ["Os valores calculados são estimativas e não substituem aconselhamento médico ou de um nutricionista."],
    },
  ],
};

const EN: typeof PT = {
  title: "Privacy policy",
  intro:
    "Taking care of yourself helps you log food, weight, body measurements, workouts and activity. This policy explains what data we keep, why, who it's shared with and how you can delete it.",
  sections: [
    {
      h: "Data we keep",
      li: [
        "Account: email, password (stored hashed by Supabase Auth), language and, if you choose, name and profile photo.",
        "If you sign in with Google: we only receive your email, name and a Google account identifier. We don't access anything else in your Google account.",
        "Profile: sex, date of birth, height, goals and calculation factors.",
        "Logs: foods and amounts, weight, body measurements (waist, hips, neck and others), meal plan, workout plan and sets done.",
        "Oura (if connected): daily summaries of activity, calories, steps, sleep, readiness and stress.",
        "Apple Health via Health Auto Export (if set up): active and basal calories, steps, exercise minutes, sleep, resting heart rate, heart rate variability, weight and workouts, including the GPS route of outdoor workouts.",
        "Minimal technical logs (e.g. the date of the last iPhone upload) to diagnose problems.",
      ],
    },
    {
      h: "What we use it for",
      li: [
        "Calculating calories, macronutrients, energy expenditure, deficit and indicators (waist-to-height ratio, estimated body fat).",
        "Showing your progress and, if you allow it, sharing it with your trainer.",
        "We don't use your data for advertising, don't sell it and don't build profiles for third parties.",
      ],
    },
    {
      h: "Legal basis",
      p: [
        "Health data (weight, measurements, sleep, heart rate, workouts) is processed with your explicit consent, given when you create the account and when you connect each integration. You can withdraw it at any time by disconnecting the integration or deleting your account.",
      ],
    },
    {
      h: "Sharing with trainers",
      p: [
        "A trainer only sees your data if you connect to them with their code, and only what you allow: meal plan, progress (logs, weight, measurements, activity) and/or workout plan. You can change permissions or end the connection in Profile → My trainer.",
      ],
    },
    {
      h: "Services we use",
      li: [
        "Supabase — database, authentication and photos, in the European Union (Frankfurt).",
        "Google — only if you choose to sign in with Google, to confirm your identity.",
        "Vercel — app hosting; requests may pass through servers outside the EU.",
        "Calorie API — only receives the terms you search for to find foods.",
        "wger — public exercise catalogue; receives none of your data.",
        "Oura — only if you connect your account; access tokens are kept on the server only.",
        "OpenStreetMap — displays route maps; your browser downloads the map images.",
      ],
    },
    {
      h: "How long we keep it",
      p: ["For as long as the account exists. When you delete your account, all data and photos are deleted immediately and cannot be recovered."],
    },
    {
      h: "Your rights",
      li: [
        "Delete your account and all data: Profile → Account and security → Delete account.",
        "Correct data: directly in Profile and in your logs.",
        "Access or export your data, object to or restrict processing: via the contact email below.",
        "Lodge a complaint with your data protection authority (in Portugal, the CNPD).",
      ],
    },
    {
      h: "Disclaimer",
      p: ["Calculated values are estimates and don't replace advice from a doctor or nutritionist."],
    },
  ],
};

export async function generateMetadata() {
  const l = await serverLocale();
  return { title: `${l === "en" ? "Privacy" : "Privacidade"} · Taking care of yourself` };
}

export default async function Privacidade() {
  const l = await serverLocale();
  const c = l === "en" ? EN : PT;
  const date = new Date(UPDATED + "T12:00:00").toLocaleDateString(l === "en" ? "en-GB" : "pt-PT", { day: "numeric", month: "long", year: "numeric" });
  return (
    <article className="mx-auto max-w-2xl space-y-5 text-sm leading-relaxed">
      <header>
        <h1 className="text-2xl font-semibold">{c.title}</h1>
        <p className="mt-1 text-xs text-muted">{l === "en" ? `Last updated: ${date}` : `Última atualização: ${date}`}</p>
      </header>
      <p>{c.intro}</p>
      {c.sections.map((s) => (
        <section key={s.h} className="space-y-2">
          <h2 className="text-base font-semibold">{s.h}</h2>
          {s.p?.map((x) => <p key={x}>{x}</p>)}
          {s.li && (
            <ul className="list-disc space-y-1 pl-5">
              {s.li.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">{l === "en" ? "Contact" : "Contacto"}</h2>
        <p>
          {CONTACT ? (
            <a className="text-accent underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
          ) : l === "en" ? (
            "Contact email to be published."
          ) : (
            "Email de contacto a publicar."
          )}
        </p>
      </section>
    </article>
  );
}
