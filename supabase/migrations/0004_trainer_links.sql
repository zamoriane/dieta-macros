-- Dieta Macros — ligação treinador ↔ cliente, permissões e histórico de alterações do plano.
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.

-- ---------------------------------------------------------------------------
-- Ligações
-- ---------------------------------------------------------------------------
create table if not exists public.trainer_links (
  id              bigint generated always as identity primary key,
  trainer_id      uuid not null references auth.users(id) on delete cascade,
  client_id       uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pendente' check (status in ('pendente', 'ativo', 'recusado', 'revogado')),
  perm_dieta      boolean not null default true,   -- criar/editar o plano alimentar
  perm_treino     boolean not null default false,  -- criar/editar o plano de treino (Implementação 3)
  perm_progresso  boolean not null default true,   -- ver registos, peso e resumo
  criado_em       timestamptz not null default now(),
  aceite_em       timestamptz,
  terminado_em    timestamptz,
  check (trainer_id <> client_id)
);
-- No máximo uma ligação "aberta" por par treinador/cliente
create unique index if not exists trainer_links_open on public.trainer_links (trainer_id, client_id)
  where status in ('pendente', 'ativo');

alter table public.trainer_links enable row level security;
drop policy if exists "ver as minhas ligações" on public.trainer_links;
create policy "ver as minhas ligações" on public.trainer_links
  for select using (client_id = auth.uid() or trainer_id = auth.uid() or public.is_admin());
-- Sem políticas de escrita: tudo passa pelas funções abaixo, que validam cada transição.

-- ---------------------------------------------------------------------------
-- Funções de permissão
-- ---------------------------------------------------------------------------
create or replace function public.can_trainer(p_client uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.trainer_links l
    join public.profiles t on t.id = l.trainer_id
    where l.client_id = p_client
      and l.trainer_id = auth.uid()
      and l.status = 'ativo'
      and t.ativo and t.pt_estado = 'aprovado'
      and case p_perm
            when 'dieta' then l.perm_dieta
            when 'treino' then l.perm_treino
            when 'progresso' then l.perm_progresso
            else false
          end
  );
$$;

-- Há uma ligação ativa entre mim e a outra pessoa (em qualquer sentido)?
create or replace function public.linked_with(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trainer_links
    where status = 'ativo'
      and ((trainer_id = auth.uid() and client_id = p_other) or (client_id = auth.uid() and trainer_id = p_other))
  );
$$;

-- ---------------------------------------------------------------------------
-- Ações (RPC)
-- ---------------------------------------------------------------------------
-- Cliente pede ligação a um treinador pelo código
create or replace function public.request_trainer(p_code text, p_dieta boolean, p_treino boolean, p_progresso boolean)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_trainer public.profiles;
  v_link public.trainer_links;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select * into v_trainer from public.profiles
   where trainer_code = upper(trim(p_code)) and pt_estado = 'aprovado' and ativo;
  if not found then raise exception 'Código de treinador inválido'; end if;
  if v_trainer.id = auth.uid() then raise exception 'Não se pode ligar a si próprio'; end if;

  select * into v_link from public.trainer_links
   where trainer_id = v_trainer.id and client_id = auth.uid() and status in ('pendente', 'ativo');
  if found then
    update public.trainer_links
       set perm_dieta = p_dieta, perm_treino = p_treino, perm_progresso = p_progresso
     where id = v_link.id;
  else
    insert into public.trainer_links (trainer_id, client_id, perm_dieta, perm_treino, perm_progresso)
    values (v_trainer.id, auth.uid(), p_dieta, p_treino, p_progresso);
  end if;
  return json_build_object('trainer_nome', coalesce(v_trainer.nome, 'Treinador'));
end $$;

-- Treinador aceita ou recusa um pedido pendente
create or replace function public.respond_link(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trainer_links
     set status = case when p_accept then 'ativo' else 'recusado' end,
         aceite_em = case when p_accept then now() else null end,
         terminado_em = case when p_accept then null else now() end
   where id = p_id and trainer_id = auth.uid() and status = 'pendente';
  if not found then raise exception 'Pedido não encontrado'; end if;
end $$;

-- Cliente ou treinador terminam a ligação
create or replace function public.revoke_link(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trainer_links set status = 'revogado', terminado_em = now()
   where id = p_id and (client_id = auth.uid() or trainer_id = auth.uid()) and status in ('pendente', 'ativo');
  if not found then raise exception 'Ligação não encontrada'; end if;
end $$;

-- Só o cliente altera as permissões que deu
create or replace function public.set_link_perms(p_id bigint, p_dieta boolean, p_treino boolean, p_progresso boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trainer_links set perm_dieta = p_dieta, perm_treino = p_treino, perm_progresso = p_progresso
   where id = p_id and client_id = auth.uid() and status in ('pendente', 'ativo');
  if not found then raise exception 'Ligação não encontrada'; end if;
end $$;

-- As minhas ligações, com o nome e o contacto da outra pessoa
create or replace function public.my_links()
returns table (
  id bigint, papel text, outra_id uuid, outra_nome text, outra_email text, status text,
  perm_dieta boolean, perm_treino boolean, perm_progresso boolean, criado_em timestamptz, aceite_em timestamptz
)
language sql stable security definer set search_path = public as $$
  select l.id,
         case when l.client_id = auth.uid() then 'cliente' else 'treinador' end,
         case when l.client_id = auth.uid() then l.trainer_id else l.client_id end,
         p.nome,
         case when l.client_id = auth.uid() then coalesce(p.pt_contacto_email, u.email) else u.email end,
         l.status, l.perm_dieta, l.perm_treino, l.perm_progresso, l.criado_em, l.aceite_em
  from public.trainer_links l
  join public.profiles p on p.id = case when l.client_id = auth.uid() then l.trainer_id else l.client_id end
  join auth.users u on u.id = p.id
  where (l.client_id = auth.uid() or l.trainer_id = auth.uid())
    and l.status in ('pendente', 'ativo')
  order by l.status, l.criado_em desc;
$$;

-- Perfil do cliente para o treinador (sem campos sensíveis como o token de envio)
create or replace function public.client_profile(p_client uuid) returns json
language sql stable security definer set search_path = public as $$
  select case when public.can_trainer(p_client, 'dieta') or public.can_trainer(p_client, 'progresso') then
    (select json_build_object(
       'id', id, 'nome', nome, 'sexo', sexo, 'data_nascimento', data_nascimento, 'altura_cm', altura_cm,
       'peso_meta_kg', peso_meta_kg, 'deficit_alvo_kcal', deficit_alvo_kcal, 'proteina_g_kg', proteina_g_kg,
       'gordura_pct', gordura_pct, 'fator_correcao_atividade', fator_correcao_atividade,
       'fator_atividade_manual', fator_atividade_manual, 'kcal_minimo', kcal_minimo,
       'fonte_atividade', fonte_atividade, 'ingest_token', null)
     from public.profiles where id = p_client)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Políticas adicionais (permissivas: somam-se às "dados próprios")
-- ---------------------------------------------------------------------------
drop policy if exists "treinador: plano alimentar" on public.plan_meals;
create policy "treinador: plano alimentar" on public.plan_meals for all
  using (public.can_trainer(user_id, 'dieta')) with check (public.can_trainer(user_id, 'dieta'));
drop policy if exists "treinador: plano alimentar" on public.plan_items;
create policy "treinador: plano alimentar" on public.plan_items for all
  using (public.can_trainer(user_id, 'dieta')) with check (public.can_trainer(user_id, 'dieta'));

-- Alimentos próprios de quem está ligado (ex.: o treinador cria um alimento e põe-no no plano do cliente)
drop policy if exists "alimentos de ligações" on public.foods;
create policy "alimentos de ligações" on public.foods for select
  using (user_id is not null and public.linked_with(user_id));

do $$
declare t text;
begin
  foreach t in array array['days','log_items','weights','oura_daily','health_daily'] loop
    execute format('drop policy if exists "treinador: progresso" on public.%I', t);
    execute format('create policy "treinador: progresso" on public.%I for select using (public.can_trainer(user_id, ''progresso''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Histórico de alterações do plano alimentar
-- ---------------------------------------------------------------------------
alter table public.plan_meals add column if not exists atualizado_por uuid, add column if not exists atualizado_em timestamptz;
alter table public.plan_items add column if not exists atualizado_por uuid, add column if not exists atualizado_em timestamptz;

create table if not exists public.plan_changes (
  id        bigint generated always as identity primary key,
  owner_id  uuid not null references auth.users(id) on delete cascade,
  actor_id  uuid references auth.users(id) on delete set null,
  acao      text not null,         -- criou / alterou / removeu
  resumo    text not null,         -- texto legível, ex.: "Aveia 50 g → 60 g (Pequeno-almoço)"
  antes     jsonb,
  depois    jsonb,
  em        timestamptz not null default now()
);
create index if not exists plan_changes_owner_idx on public.plan_changes (owner_id, em desc);
alter table public.plan_changes enable row level security;
drop policy if exists "ver histórico" on public.plan_changes;
create policy "ver histórico" on public.plan_changes for select
  using (owner_id = auth.uid() or public.can_trainer(owner_id, 'dieta') or public.is_admin());

create or replace function public.plan_stamp() returns trigger
language plpgsql as $$
begin
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.plan_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := coalesce(new.user_id, old.user_id);
  v_acao text := case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'removeu' end;
  v_resumo text;
  v_food text;
  v_meal text;
begin
  if tg_table_name = 'plan_meals' then
    if tg_op = 'UPDATE' and new.nome is not distinct from old.nome then
      return null; -- só reordenação: não regista
    end if;
    v_resumo := case tg_op
      when 'INSERT' then 'Refeição "' || new.nome || '"'
      when 'DELETE' then 'Refeição "' || old.nome || '"'
      else 'Refeição "' || old.nome || '" → "' || new.nome || '"' end;
  else
    if tg_op = 'UPDATE' and new.gramas is not distinct from old.gramas and new.food_id is not distinct from old.food_id then
      return null;
    end if;
    select name into v_food from public.foods where id = coalesce(new.food_id, old.food_id);
    select nome into v_meal from public.plan_meals where id = coalesce(new.plan_meal_id, old.plan_meal_id);
    v_resumo := coalesce(v_food, 'Alimento') || ' ' ||
      case tg_op
        when 'INSERT' then trim_scale(new.gramas)::text || ' g'
        when 'DELETE' then trim_scale(old.gramas)::text || ' g'
        else trim_scale(old.gramas)::text || ' g → ' || trim_scale(new.gramas)::text || ' g' end ||
      coalesce(' (' || v_meal || ')', '');
  end if;

  insert into public.plan_changes (owner_id, actor_id, acao, resumo, antes, depois)
  values (v_owner, auth.uid(), v_acao, v_resumo,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

drop trigger if exists plan_meals_stamp on public.plan_meals;
create trigger plan_meals_stamp before insert or update on public.plan_meals for each row execute function public.plan_stamp();
drop trigger if exists plan_items_stamp on public.plan_items;
create trigger plan_items_stamp before insert or update on public.plan_items for each row execute function public.plan_stamp();
drop trigger if exists plan_meals_audit on public.plan_meals;
create trigger plan_meals_audit after insert or update or delete on public.plan_meals for each row execute function public.plan_audit();
drop trigger if exists plan_items_audit on public.plan_items;
create trigger plan_items_audit after insert or update or delete on public.plan_items for each row execute function public.plan_audit();
