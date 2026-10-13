-- Dieta Macros — esquema inicial
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.
-- Todas as tabelas de utilizador têm user_id e RLS, para o app poder ser multi-utilizador.

-- ---------------------------------------------------------------------------
-- Perfil e metas
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nome              text,
  sexo              text check (sexo in ('M','F')),
  data_nascimento   date,
  altura_cm         numeric(5,1),
  peso_meta_kg      numeric(5,1),
  deficit_alvo_kcal integer not null default 500,
  proteina_g_kg     numeric(3,1) not null default 1.8,
  gordura_pct       integer not null default 25,       -- % das calorias-alvo
  fator_correcao_atividade numeric(3,2) not null default 0.85, -- sobre active_calories do Oura
  fator_atividade_manual   numeric(3,2) not null default 1.30, -- sem Oura: TMB × fator
  kcal_minimo       integer not null default 1500,     -- alerta de ingestão muito baixa
  criado_em         timestamptz not null default now()
);

-- Cria o perfil automaticamente quando o utilizador se regista
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Peso (registo diário, de manhã)
create table public.weights (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia     date not null,
  kg      numeric(5,2) not null check (kg > 20 and kg < 400),
  primary key (user_id, dia)
);

-- ---------------------------------------------------------------------------
-- Alimentos: cache da Calorie API (user_id nulo, partilhado) + alimentos próprios
-- ---------------------------------------------------------------------------
create table public.foods (
  id            bigint generated always as identity primary key,
  user_id       uuid references auth.users(id) on delete cascade, -- nulo = vindo da API
  source        text not null check (source in ('calorieapi','custom')),
  external_id   bigint,
  name          text not null,
  brand         text,
  kcal_100g     numeric(7,2) not null,
  protein_100g  numeric(6,2) not null default 0,
  carbs_100g    numeric(6,2) not null default 0,
  fat_100g      numeric(6,2) not null default 0,
  fiber_100g    numeric(6,2) not null default 0,
  sugar_100g    numeric(6,2) not null default 0,
  portions      jsonb not null default '[]'::jsonb,  -- [{label, grams}]
  atualizado_em timestamptz not null default now(),
  unique (source, external_id)
);
create index foods_name_idx on public.foods using gin (to_tsvector('simple', name));

-- ---------------------------------------------------------------------------
-- Plano base (modelo do dia)
-- ---------------------------------------------------------------------------
create table public.plan_meals (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  nome     text not null,
  hora     time,
  posicao  integer not null default 0
);

create table public.plan_items (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  plan_meal_id bigint not null references public.plan_meals(id) on delete cascade,
  food_id      bigint not null references public.foods(id),
  gramas       numeric(7,1) not null check (gramas > 0),
  posicao      integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Registo diário (realizado). Cada item guarda um snapshot nutricional,
-- para o histórico não mudar se o alimento for corrigido depois.
-- ---------------------------------------------------------------------------
create table public.days (
  user_id   uuid not null references auth.users(id) on delete cascade,
  dia       date not null,
  notas     text,
  criado_em timestamptz not null default now(),
  primary key (user_id, dia)
);

create table public.log_items (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  dia          date not null,
  refeicao     text not null,
  refeicao_pos integer not null default 0,
  food_id      bigint references public.foods(id),
  food_name    text not null,
  gramas       numeric(7,1) not null check (gramas > 0),
  gramas_plano numeric(7,1),            -- quantidade prevista no plano (nulo = extra)
  kcal         numeric(7,1) not null,
  protein      numeric(6,1) not null,
  carbs        numeric(6,1) not null,
  fat          numeric(6,1) not null,
  fiber        numeric(6,1) not null default 0,
  criado_em    timestamptz not null default now(),
  foreign key (user_id, dia) references public.days(user_id, dia) on delete cascade
);
create index log_items_user_dia_idx on public.log_items (user_id, dia);

-- Totais por dia (base das visões semanal e mensal)
create view public.daily_totals with (security_invoker = true) as
select user_id, dia,
       round(sum(kcal), 0)    as kcal,
       round(sum(protein), 1) as protein,
       round(sum(carbs), 1)   as carbs,
       round(sum(fat), 1)     as fat,
       round(sum(fiber), 1)   as fiber
from public.log_items
group by user_id, dia;

-- ---------------------------------------------------------------------------
-- Oura
-- ---------------------------------------------------------------------------
-- Tokens: só o servidor (service role) lê e escreve. Sem políticas = sem acesso pelo navegador.
create table public.oura_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  atualizado_em timestamptz not null default now()
);

create table public.oura_daily (
  user_id          uuid not null references auth.users(id) on delete cascade,
  dia              date not null,
  active_calories  integer,
  total_calories   integer,
  steps            integer,
  sleep_score      integer,
  readiness_score  integer,
  stress_high_min  integer,
  recovery_high_min integer,
  stress_summary   text,
  raw              jsonb not null default '{}'::jsonb,
  atualizado_em    timestamptz not null default now(),
  primary key (user_id, dia)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.weights     enable row level security;
alter table public.foods       enable row level security;
alter table public.plan_meals  enable row level security;
alter table public.plan_items  enable row level security;
alter table public.days        enable row level security;
alter table public.log_items   enable row level security;
alter table public.oura_tokens enable row level security;
alter table public.oura_daily  enable row level security;

create policy "perfil próprio" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "dados próprios" on public.weights    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dados próprios" on public.plan_meals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dados próprios" on public.plan_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dados próprios" on public.days       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dados próprios" on public.log_items  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leitura própria" on public.oura_daily for select using (user_id = auth.uid());

-- Alimentos: todos leem a cache da API; cada um gere os seus alimentos próprios.
create policy "ler alimentos" on public.foods
  for select using (user_id is null or user_id = auth.uid());
create policy "criar alimento próprio" on public.foods
  for insert with check (user_id = auth.uid() and source = 'custom');
create policy "editar alimento próprio" on public.foods
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "apagar alimento próprio" on public.foods
  for delete using (user_id = auth.uid());
