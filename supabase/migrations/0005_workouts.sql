-- Dieta Macros — plano de treino (exercícios da wger), registo de séries e histórico de alterações.
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.

-- ---------------------------------------------------------------------------
-- Catálogo de exercícios (cópia compacta da wger, preenchida pelo servidor)
-- ---------------------------------------------------------------------------
create table if not exists public.exercises (
  id            integer primary key,          -- id do exercício na wger
  nome          text not null,                -- português se existir, senão inglês
  nome_pt       text,
  nome_en       text,
  categoria     text,
  musculos      jsonb not null default '[]',  -- [{id, nome, frente, sec, img}]
  equipamento   text[] not null default '{}',
  imagem        text,
  imagem_thumb  text,
  descricao     text,                         -- texto simples (sem HTML)
  autor         text,                         -- autoria exigida pela licença CC BY-SA
  licenca       text,
  busca         text not null default '',     -- texto normalizado para pesquisa
  rank          smallint not null default 3,  -- 0 = nome em PT e imagem … 3 = nenhum
  atualizado_em timestamptz not null default now()
);
create index if not exists exercises_categoria_idx on public.exercises (categoria);
alter table public.exercises enable row level security;
drop policy if exists "ler exercícios" on public.exercises;
create policy "ler exercícios" on public.exercises for select to authenticated using (true);
-- Sem políticas de escrita: só o servidor (service role) atualiza o catálogo.

-- ---------------------------------------------------------------------------
-- Plano de treino: dias (Treino A, B…) e exercícios de cada dia
-- ---------------------------------------------------------------------------
create table if not exists public.workout_days (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,  -- dono do plano (cliente)
  nome           text not null,
  dias_semana    smallint[] not null default '{}',  -- 0 = domingo … 6 = sábado
  notas          text,
  posicao        integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_por uuid,
  atualizado_em  timestamptz
);
create index if not exists workout_days_user_idx on public.workout_days (user_id, posicao);

create table if not exists public.workout_exercises (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  workout_day_id bigint not null references public.workout_days(id) on delete cascade,
  exercise_id    integer references public.exercises(id) on delete set null,
  nome           text not null,
  imagem         text,
  series         smallint check (series between 1 and 20),
  reps           text check (char_length(reps) <= 20),     -- "8-12", "15", "30 s", "falha"
  carga_kg       numeric(6,2) check (carga_kg >= 0),
  descanso_s     integer check (descanso_s between 0 and 900),
  notas          text check (char_length(notas) <= 500),
  posicao        integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_por uuid,
  atualizado_em  timestamptz
);
create index if not exists workout_exercises_day_idx on public.workout_exercises (workout_day_id, posicao);
create index if not exists workout_exercises_user_idx on public.workout_exercises (user_id);

-- Séries feitas pelo cliente
create table if not exists public.workout_logs (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  dia                 date not null,
  workout_day_id      bigint references public.workout_days(id) on delete set null,
  workout_exercise_id bigint references public.workout_exercises(id) on delete set null,
  exercise_id         integer,
  nome                text not null,
  serie               smallint not null check (serie between 1 and 30),
  reps                smallint check (reps between 0 and 500),
  carga_kg            numeric(6,2) check (carga_kg >= 0),
  feito_em            timestamptz not null default now()
);
create index if not exists workout_logs_user_dia_idx on public.workout_logs (user_id, dia desc);
create index if not exists workout_logs_ex_idx on public.workout_logs (workout_exercise_id, dia desc);

-- O dono de cada linha é sempre o dono do "pai": impede pendurar linhas no plano de outra pessoa.
-- (BEFORE trigger: corre antes da verificação RLS "with check".)
create or replace function public.inherit_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'workout_exercises' then
    select user_id into new.user_id from public.workout_days where id = new.workout_day_id;
  elsif tg_table_name = 'workout_logs' then
    -- Só o próprio regista séries; numa alteração (inclui o "set null" quando um exercício é apagado) o dono mantém-se.
    new.user_id := case when tg_op = 'INSERT' then auth.uid() else old.user_id end;
    if new.workout_exercise_id is not null and new.workout_exercise_id is distinct from (case when tg_op = 'UPDATE' then old.workout_exercise_id end)
       and not exists (
      select 1 from public.workout_exercises where id = new.workout_exercise_id and user_id = new.user_id) then
      raise exception 'Exercício não pertence ao seu plano';
    end if;
  elsif tg_table_name = 'plan_items' then
    select user_id into new.user_id from public.plan_meals where id = new.plan_meal_id;
  end if;
  if new.user_id is null then raise exception 'Registo pai não encontrado'; end if;
  return new;
end $$;

drop trigger if exists workout_exercises_owner on public.workout_exercises;
create trigger workout_exercises_owner before insert or update on public.workout_exercises
  for each row execute function public.inherit_owner();
drop trigger if exists workout_logs_owner on public.workout_logs;
create trigger workout_logs_owner before insert or update on public.workout_logs
  for each row execute function public.inherit_owner();
drop trigger if exists plan_items_owner on public.plan_items;
create trigger plan_items_owner before insert or update on public.plan_items
  for each row execute function public.inherit_owner();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_logs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['workout_days','workout_exercises'] loop
    execute format('drop policy if exists "dados próprios" on public.%I', t);
    execute format('create policy "dados próprios" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "treinador: plano de treino" on public.%I', t);
    execute format('create policy "treinador: plano de treino" on public.%I for all
                    using (public.can_trainer(user_id, ''treino'')) with check (public.can_trainer(user_id, ''treino''))', t);
  end loop;
end $$;

drop policy if exists "dados próprios" on public.workout_logs;
create policy "dados próprios" on public.workout_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "treinador: ver séries" on public.workout_logs;
create policy "treinador: ver séries" on public.workout_logs for select
  using (public.can_trainer(user_id, 'treino') or public.can_trainer(user_id, 'progresso'));

-- ---------------------------------------------------------------------------
-- Histórico de alterações do plano de treino
-- ---------------------------------------------------------------------------
create table if not exists public.workout_changes (
  id        bigint generated always as identity primary key,
  owner_id  uuid not null references auth.users(id) on delete cascade,
  actor_id  uuid references auth.users(id) on delete set null,
  acao      text not null,
  resumo    text not null,
  antes     jsonb,
  depois    jsonb,
  em        timestamptz not null default now()
);
create index if not exists workout_changes_owner_idx on public.workout_changes (owner_id, em desc);
alter table public.workout_changes enable row level security;
drop policy if exists "ver histórico" on public.workout_changes;
create policy "ver histórico" on public.workout_changes for select
  using (owner_id = auth.uid() or public.can_trainer(owner_id, 'treino') or public.is_admin());

create or replace function public.workout_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := coalesce(new.user_id, old.user_id);
  v_acao text := case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'removeu' end;
  v_resumo text;
  v_day text;
  v_ex text;
begin
  if tg_table_name = 'workout_days' then
    if tg_op = 'UPDATE' and new.nome is not distinct from old.nome and new.dias_semana is not distinct from old.dias_semana
       and new.notas is not distinct from old.notas then
      return null; -- só reordenação
    end if;
    v_resumo := case tg_op
      when 'INSERT' then 'Treino "' || new.nome || '"'
      when 'DELETE' then 'Treino "' || old.nome || '"'
      else 'Treino "' || old.nome || '"' || case when new.nome is distinct from old.nome then ' → "' || new.nome || '"' else '' end end;
  else
    if tg_op = 'UPDATE' and (new.series, new.reps, new.carga_kg, new.descanso_s, new.nome, new.notas, new.exercise_id)
       is not distinct from (old.series, old.reps, old.carga_kg, old.descanso_s, old.nome, old.notas, old.exercise_id) then
      return null;
    end if;
    select nome into v_day from public.workout_days where id = coalesce(new.workout_day_id, old.workout_day_id);
    v_ex := case when tg_op = 'DELETE' then old.nome else new.nome end;
    v_resumo := v_ex || ' ' ||
      case tg_op
        when 'INSERT' then coalesce(new.series::text || '×' || coalesce(new.reps, '?'), '') ||
                           coalesce(' · ' || trim_scale(new.carga_kg)::text || ' kg', '')
        when 'DELETE' then ''
        else coalesce(old.series::text, '?') || '×' || coalesce(old.reps, '?') || coalesce(' · ' || trim_scale(old.carga_kg)::text || ' kg', '') ||
             ' → ' || coalesce(new.series::text, '?') || '×' || coalesce(new.reps, '?') || coalesce(' · ' || trim_scale(new.carga_kg)::text || ' kg', '')
      end || coalesce(' (' || v_day || ')', '');
  end if;

  insert into public.workout_changes (owner_id, actor_id, acao, resumo, antes, depois)
  values (v_owner, auth.uid(), v_acao, trim(v_resumo),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

drop trigger if exists workout_days_stamp on public.workout_days;
create trigger workout_days_stamp before insert or update on public.workout_days for each row execute function public.plan_stamp();
drop trigger if exists workout_exercises_stamp on public.workout_exercises;
create trigger workout_exercises_stamp before insert or update on public.workout_exercises for each row execute function public.plan_stamp();
drop trigger if exists workout_days_audit on public.workout_days;
create trigger workout_days_audit after insert or update or delete on public.workout_days for each row execute function public.workout_audit();
drop trigger if exists workout_exercises_audit on public.workout_exercises;
create trigger workout_exercises_audit after insert or update or delete on public.workout_exercises for each row execute function public.workout_audit();

-- ---------------------------------------------------------------------------
-- Contas desativadas: bloqueio também nas tabelas novas
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['exercises','workout_days','workout_exercises','workout_logs','workout_changes'] loop
    execute format('drop policy if exists "conta ativa" on public.%I', t);
    execute format('create policy "conta ativa" on public.%I as restrictive for all to authenticated
                    using (public.is_active()) with check (public.is_active())', t);
  end loop;
end $$;

-- Perfil do cliente também visível para um treinador só com permissão de treino
create or replace function public.client_profile(p_client uuid) returns json
language sql stable security definer set search_path = public as $$
  select case when public.can_trainer(p_client, 'dieta') or public.can_trainer(p_client, 'progresso')
                or public.can_trainer(p_client, 'treino') then
    (select json_build_object(
       'id', id, 'nome', nome, 'sexo', sexo, 'data_nascimento', data_nascimento, 'altura_cm', altura_cm,
       'peso_meta_kg', peso_meta_kg, 'deficit_alvo_kcal', deficit_alvo_kcal, 'proteina_g_kg', proteina_g_kg,
       'gordura_pct', gordura_pct, 'fator_correcao_atividade', fator_correcao_atividade,
       'fator_atividade_manual', fator_atividade_manual, 'kcal_minimo', kcal_minimo,
       'fonte_atividade', fonte_atividade, 'ingest_token', null)
     from public.profiles where id = p_client)
  end;
$$;
