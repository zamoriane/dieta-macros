-- Dieta Macros — Apple Health (via app Health Auto Export)
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.

-- Token pessoal para o iPhone enviar dados, e escolha da fonte das calorias ativas
alter table public.profiles
  add column if not exists ingest_token text unique,
  add column if not exists fonte_atividade text not null default 'oura'
    check (fonte_atividade in ('oura', 'apple'));

-- Resumo diário vindo do Apple Health
create table if not exists public.health_daily (
  user_id        uuid not null references auth.users(id) on delete cascade,
  dia            date not null,
  active_kcal    integer,
  basal_kcal     integer,
  steps          integer,
  exercise_min   integer,
  sleep_min      integer,
  resting_hr     numeric(5,1),
  hrv_ms         numeric(6,1),
  weight_kg      numeric(5,2),
  workouts       jsonb not null default '[]'::jsonb,  -- [{name, start, min, kcal}]
  atualizado_em  timestamptz not null default now(),
  primary key (user_id, dia)
);

-- Registo de cada envio (para diagnóstico; o servidor guarda só os últimos)
create table if not exists public.health_ingest_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  recebido_em timestamptz not null default now(),
  bytes       integer not null,
  resumo      jsonb not null default '{}'::jsonb,
  amostra     jsonb   -- início do payload, truncado
);
create index if not exists health_ingest_log_user_idx on public.health_ingest_log (user_id, recebido_em desc);

alter table public.health_daily      enable row level security;
alter table public.health_ingest_log enable row level security;

create policy "leitura própria" on public.health_daily      for select using (user_id = auth.uid());
create policy "leitura própria" on public.health_ingest_log for select using (user_id = auth.uid());
