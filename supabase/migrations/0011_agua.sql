-- Taking care of yourself — registo de água e bebidas + configuração (meta, copos, lembretes).
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.

create table if not exists public.water_logs (
  id       bigint generated always as identity primary key,
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dia      date not null,
  hora     timestamptz not null default now(),
  ml       integer not null check (ml between 10 and 3000),
  bebida   text not null check (char_length(bebida) between 1 and 30),
  fator    numeric(3,2) not null default 1 check (fator between 0 and 1.5)
);
create index if not exists water_logs_user_dia on public.water_logs (user_id, dia);

alter table public.water_logs enable row level security;
drop policy if exists "dados próprios" on public.water_logs;
create policy "dados próprios" on public.water_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "treinador: progresso" on public.water_logs;
create policy "treinador: progresso" on public.water_logs for select
  using (public.can_trainer(user_id, 'progresso'));
drop policy if exists "conta ativa" on public.water_logs;
create policy "conta ativa" on public.water_logs as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- Configuração da água no perfil: { meta_ml, copos: [{ml, bebida}], lembretes: {...} }
alter table public.profiles add column if not exists agua jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_agua_check;
alter table public.profiles add constraint profiles_agua_check
  check (jsonb_typeof(agua) = 'object' and octet_length(agua::text) <= 4000);
