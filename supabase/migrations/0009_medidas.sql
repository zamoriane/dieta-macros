-- Taking care of yourself — medidas corporais (cm), uma linha por dia e por pessoa.
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.

create table if not exists public.body_measurements (
  user_id  uuid not null references auth.users(id) on delete cascade,
  dia      date not null,
  cintura  numeric(5,1) check (cintura between 30 and 250),
  anca     numeric(5,1) check (anca between 30 and 250),
  pescoco  numeric(5,1) check (pescoco between 15 and 80),
  peito    numeric(5,1) check (peito between 30 and 250),
  braco    numeric(5,1) check (braco between 10 and 80),
  coxa     numeric(5,1) check (coxa between 20 and 120),
  notas    text check (char_length(notas) <= 300),
  criado_em timestamptz not null default now(),
  primary key (user_id, dia)
);

alter table public.body_measurements enable row level security;
drop policy if exists "dados próprios" on public.body_measurements;
create policy "dados próprios" on public.body_measurements for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "treinador: progresso" on public.body_measurements;
create policy "treinador: progresso" on public.body_measurements for select
  using (public.can_trainer(user_id, 'progresso') or public.can_trainer(user_id, 'treino'));
drop policy if exists "conta ativa" on public.body_measurements;
create policy "conta ativa" on public.body_measurements as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());
