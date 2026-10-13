-- Dieta Macros — papéis (admin / treinador / cliente), ativação de contas e pedidos de Perfil Treinador.
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.

-- ---------------------------------------------------------------------------
-- Colunas novas no perfil
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'cliente'
    check (role in ('cliente', 'treinador', 'admin')),
  add column if not exists ativo boolean not null default true,
  add column if not exists pt_estado text
    check (pt_estado in ('pendente', 'aprovado', 'recusado')),
  add column if not exists pt_contacto_email text,
  add column if not exists pt_pedido_em timestamptz,
  add column if not exists trainer_code text unique;

-- ---------------------------------------------------------------------------
-- Funções auxiliares (SECURITY DEFINER: leem o perfil sem depender do RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and ativo);
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativo from public.profiles where id = auth.uid()), true);
$$;

-- Pedido privilegiado: SQL Editor (postgres), chave service_role (servidor) ou um admin.
-- SECURITY INVOKER de propósito: current_user tem de ser quem faz o pedido, não o dono da função.
create or replace function public.is_privileged() returns boolean
language sql stable set search_path = public as $$
  select current_user in ('postgres', 'supabase_admin', 'service_role')
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- Proteção: um utilizador comum não pode mudar o próprio papel, estado,
-- código de treinador, nem aprovar o próprio pedido de PT.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_privileged() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'cliente';
    new.ativo := true;
    new.trainer_code := null;
    new.pt_estado := null;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.ativo is distinct from old.ativo
     or new.trainer_code is distinct from old.trainer_code then
    raise exception 'Sem permissão para alterar papel, estado ou código de treinador';
  end if;

  if new.pt_estado is distinct from old.pt_estado then
    -- O utilizador só pode pedir (pendente) ou cancelar o pedido (null); aprovar/recusar é do admin.
    if old.pt_estado = 'aprovado' or (new.pt_estado is not null and new.pt_estado <> 'pendente') then
      raise exception 'Sem permissão para alterar o estado do pedido de treinador';
    end if;
    if new.pt_estado = 'pendente' then
      new.pt_pedido_em := now();
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Admin pode ler todos os perfis (as alterações passam pelo servidor)
-- ---------------------------------------------------------------------------
drop policy if exists "admin lê perfis" on public.profiles;
create policy "admin lê perfis" on public.profiles for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Contas desativadas: bloqueio no banco, além do bloqueio no login
-- (políticas RESTRICTIVE somam-se às existentes como um "E")
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['weights','foods','plan_meals','plan_items','days','log_items',
                           'oura_daily','health_daily','health_ingest_log']
  loop
    execute format('drop policy if exists "conta ativa" on public.%I', t);
    execute format('create policy "conta ativa" on public.%I as restrictive for all to authenticated
                    using (public.is_active()) with check (public.is_active())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Auditoria das ações de administração
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit (
  id      bigint generated always as identity primary key,
  actor   uuid references auth.users(id) on delete set null,
  target  uuid references auth.users(id) on delete set null,
  acao    text not null,
  detalhe jsonb not null default '{}'::jsonb,
  em      timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
drop policy if exists "admin lê auditoria" on public.admin_audit;
create policy "admin lê auditoria" on public.admin_audit for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- O primeiro administrador: a conta do dono da aplicação
-- ---------------------------------------------------------------------------
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'zamoriane@gmail.com');
