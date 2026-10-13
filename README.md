# Dieta Macros

App web responsivo (PC, tablet, telemóvel) para organizar a dieta por macronutrientes, com plano base, registo diário, metas, balanço energético (basal + atividade) e integração com o Oura.

**Stack:** Next.js 15 (React, TypeScript, Tailwind) na Vercel · Supabase (PostgreSQL, login, RLS) · Calorie API · Oura API v2 (OAuth2).

## O que já faz

- **Plano base**: refeições com alimentos e gramas. Cada dia novo nasce como cópia do plano.
- **Hoje**: totais por refeição e do dia, edição de quantidades (mostra a diferença vs. plano), extras, outras refeições, navegação entre dias.
- **Metas automáticas**: calorias = gasto − défice-alvo; proteína em g/kg; gordura em % das kcal; carboidratos no resto.
- **Balanço energético**: basal por Mifflin-St Jeor + atividade (Oura `active_calories` × fator de correção, ou fator manual sem Oura). O `total_calories` do Oura aparece só como referência, para não contar o basal duas vezes.
- **Alertas ao abrir**: calorias acima da meta, proteína baixa ao fim do dia, 3+ dias abaixo do mínimo, falta de peso registado, sono fraco.
- **Resumo semanal e mensal**: médias, défice acumulado, gordura estimada vs. balança, gráfico ingerido × gasto, tabela por dia.
- **Gasto real adaptativo**: com 14+ dias de peso e ingestão, estima o gasto pela evolução do peso.
- **Alimentos**: busca na base local e na Calorie API (com cache), mais alimentos próprios (rótulo da embalagem).
- **Oura**: ligação OAuth2, sincroniza 30 dias ao ligar, ao abrir o app (máx. 1×/hora) e todas as manhãs (cron da Vercel).

## Configuração (uma vez)

### 1. Supabase
1. Crie um projeto em https://supabase.com, **região Frankfurt (eu-central-1)**.
2. **SQL Editor → New query**: cole o conteúdo de `supabase/migrations/0001_init.sql` e clique **Run**.
3. **Project Settings → API**: copie `Project URL`, `anon public` e `service_role`.
4. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do app na Vercel (ex.: `https://dieta-macros.vercel.app`).

### 2. Vercel
1. Em https://vercel.com → **Add New → Project** → importe `zamoriane/dieta-macros`.
2. Em **Environment Variables**, adicione as variáveis do `.env.example`:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` (secreta) |
| `CALORIE_API_KEY` | chave da Calorie API (de preferência uma nova) |
| `CRON_SECRET` | um texto longo aleatório |
| `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OURA_REDIRECT_URI` | depois do passo 3 |

3. **Deploy**.

### 3. Oura (quando quiser ligar)
1. Em https://developer.ouraring.com/applications crie uma aplicação.
2. *Redirect URI*: `https://<seu-app>.vercel.app/api/oura/callback`. Scopes: `personal` e `daily`.
3. Coloque `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` e `OURA_REDIRECT_URI` na Vercel e faça *Redeploy*.
4. No app: **Perfil → Ligar ao Oura**.

### 4. Apple Watch (opcional, via Health Auto Export)
1. No Supabase, rode `supabase/migrations/0002_apple_health.sql` no SQL Editor.
2. No app: **Perfil → Apple Watch → Gerar token de envio**. Copie a URL e o header.
3. No iPhone, na app **Health Auto Export**: *Automations → New → REST API*, cole a URL, formato **JSON**, versão **2**, agregação **diária**, intervalo **últimos 7 dias**, adicione o header `Authorization` com o valor copiado, e escolha as métricas (Active Energy, Basal Energy Burned, Step Count, Exercise Time, Sleep Analysis, Resting Heart Rate, HRV, Weight) e Workouts.
4. No Perfil, escolha a fonte das calorias ativas (Oura ou Apple Watch).

### 5. Utilizadores e treinadores
1. No Supabase, rode `supabase/migrations/0003_roles_admin.sql`. A conta do dono fica como **admin**.
2. A área **Admin** (barra superior no desktop; no telemóvel em Perfil → Administração) lista utilizadores, permite ativar/desativar contas e aprovar pedidos de **Perfil Treinador (PT)**, que geram um código único.
3. Qualquer utilizador pode pedir o Perfil Treinador em **Perfil → Perfil Treinador (PT)**.

### 6. Primeiro uso
1. Crie a conta no ecrã de login e confirme o email.
2. **Perfil**: sexo, data de nascimento, altura, peso de hoje, metas.
3. **Plano**: crie as refeições padrão e adicione os alimentos.
4. No telemóvel: abra o site e use *Adicionar ao ecrã principal* para ter o ícone como uma app.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # preencher
npm run dev                  # http://localhost:3000
npm test                     # testes dos cálculos
```

## Notas

- `next.config.ts` tem `ignoreBuildErrors` ligado porque o primeiro código foi escrito sem acesso ao npm. Depois do primeiro build verde, desligar e corrigir eventuais avisos de tipos.
- A Calorie API devolve nomes sobretudo em inglês ("oats", "egg"). Os alimentos usados ficam na cache local e podem ser encontrados depois pelo nome.
- Fórmulas e constantes estão em `src/lib/nutrition.ts`, com testes em `src/lib/nutrition.test.ts`.
