-- Taking care of yourself — catálogo fixo de alimentos genéricos (INSA, Portugal; TACO, Brasil).
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.
--
-- Os alimentos das tabelas oficiais ficam na tabela `foods` (como a cache da Calorie API),
-- com fonte, versão e grupo. A importação faz-se na área de Admin a partir do Excel oficial.
-- Nada é apagado: um alimento que sai da tabela nova fica inativo (deixa de aparecer na
-- pesquisa, mas planos e registos antigos continuam a apontar para ele).
-- Os registos do diário guardam os valores no momento do registo, por isso não mudam.
-- Reversão no fim do ficheiro.

create extension if not exists unaccent with schema extensions;

-- Fontes aceites
alter table public.foods drop constraint if exists foods_source_check;
alter table public.foods add constraint foods_source_check
  check (source in ('calorieapi', 'custom', 'insa', 'taco'));

alter table public.foods
  add column if not exists ativo      boolean not null default true,
  add column if not exists versao     text,
  add column if not exists grupo      text,
  add column if not exists unidade    text not null default 'g',
  add column if not exists extra      jsonb not null default '{}'::jsonb,
  add column if not exists nome_busca text;

alter table public.foods drop constraint if exists foods_unidade_check;
alter table public.foods add constraint foods_unidade_check check (unidade in ('g', 'ml'));

-- Nome sem acentos e em minúsculas, para a pesquisa ("acucar" encontra "Açúcar")
create or replace function public.foods_nome_busca() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.nome_busca := lower(extensions.unaccent(concat_ws(' ', new.name, new.brand)));
  return new;
end $$;

drop trigger if exists foods_nome_busca on public.foods;
create trigger foods_nome_busca before insert or update of name, brand on public.foods
  for each row execute function public.foods_nome_busca();

-- Preenche o campo de pesquisa nas linhas que já existem (não altera nenhum outro valor)
update public.foods
   set nome_busca = lower(extensions.unaccent(concat_ws(' ', name, brand)))
 where nome_busca is null;

create index if not exists foods_catalogo_idx on public.foods (source, ativo);

-- ---------------------------------------------------------------------------
-- Histórico das importações (só o administrador lê; só o servidor escreve)
-- ---------------------------------------------------------------------------
create table if not exists public.food_imports (
  id          bigint generated always as identity primary key,
  fonte       text not null check (fonte in ('insa', 'taco')),
  versao      text not null,
  ficheiro    text,
  actor       uuid references auth.users(id) on delete set null,
  total       integer not null,
  novos       integer not null,
  alterados   integer not null,
  inativados  integer not null,
  reativados  integer not null,
  ignorados   integer not null,
  em          timestamptz not null default now()
);
alter table public.food_imports enable row level security;
drop policy if exists "admin lê importações" on public.food_imports;
create policy "admin lê importações" on public.food_imports for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Aplica uma importação de uma só vez (tudo ou nada).
-- p_rows: [{external_id, name, grupo, unidade, kcal_100g, protein_100g, carbs_100g, fat_100g,
--           fiber_100g, sugar_100g, extra}]
-- Só o servidor (service_role) a pode chamar; a rota verifica antes que quem pede é admin.
-- ---------------------------------------------------------------------------
create or replace function public.import_food_catalog(
  p_fonte text, p_versao text, p_ficheiro text, p_actor uuid, p_rows jsonb, p_ignorados int default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_total int; v_novos int; v_alterados int; v_inativados int; v_reativados int;
begin
  if p_fonte not in ('insa', 'taco') then raise exception 'fonte inválida: %', p_fonte; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'sem alimentos para importar';
  end if;

  drop table if exists _in;
  create temp table _in on commit drop as
  select (r ->> 'external_id')::bigint            as external_id,
         r ->> 'name'                              as name,
         r ->> 'grupo'                             as grupo,
         coalesce(r ->> 'unidade', 'g')            as unidade,
         (r ->> 'kcal_100g')::numeric              as kcal_100g,
         coalesce((r ->> 'protein_100g')::numeric, 0) as protein_100g,
         coalesce((r ->> 'carbs_100g')::numeric, 0)   as carbs_100g,
         coalesce((r ->> 'fat_100g')::numeric, 0)     as fat_100g,
         coalesce((r ->> 'fiber_100g')::numeric, 0)   as fiber_100g,
         coalesce((r ->> 'sugar_100g')::numeric, 0)   as sugar_100g,
         coalesce(r -> 'extra', '{}'::jsonb)       as extra
    from jsonb_array_elements(p_rows) r;

  if exists (select 1 from _in where external_id is null or name is null or kcal_100g is null) then
    raise exception 'linhas sem código, nome ou energia';
  end if;
  if (select count(*) from _in) <> (select count(distinct external_id) from _in) then
    raise exception 'códigos repetidos no ficheiro';
  end if;

  select count(*) into v_total from _in;
  select count(*) into v_novos from _in i
   where not exists (select 1 from foods f where f.source = p_fonte and f.external_id = i.external_id);
  select count(*) into v_alterados from _in i join foods f on f.source = p_fonte and f.external_id = i.external_id
   where (f.name, f.grupo, f.unidade, f.kcal_100g, f.protein_100g, f.carbs_100g, f.fat_100g, f.fiber_100g, f.sugar_100g)
         is distinct from
         (i.name, i.grupo, i.unidade, round(i.kcal_100g, 2), round(i.protein_100g, 2), round(i.carbs_100g, 2),
          round(i.fat_100g, 2), round(i.fiber_100g, 2), round(i.sugar_100g, 2));
  select count(*) into v_reativados from _in i join foods f on f.source = p_fonte and f.external_id = i.external_id
   where not f.ativo;

  insert into foods (user_id, source, external_id, name, brand, grupo, unidade, versao, ativo,
                     kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, extra, portions, atualizado_em)
  select null, p_fonte, i.external_id, i.name, null, i.grupo, i.unidade, p_versao, true,
         round(i.kcal_100g, 2), round(i.protein_100g, 2), round(i.carbs_100g, 2), round(i.fat_100g, 2),
         round(i.fiber_100g, 2), round(i.sugar_100g, 2), i.extra, '[]'::jsonb, now()
    from _in i
  on conflict (source, external_id) do update
     set name = excluded.name, grupo = excluded.grupo, unidade = excluded.unidade, versao = excluded.versao,
         ativo = true, kcal_100g = excluded.kcal_100g, protein_100g = excluded.protein_100g,
         carbs_100g = excluded.carbs_100g, fat_100g = excluded.fat_100g, fiber_100g = excluded.fiber_100g,
         sugar_100g = excluded.sugar_100g, extra = excluded.extra, atualizado_em = now();

  -- Os que saíram da tabela ficam inativos (não se apagam)
  update foods f set ativo = false, atualizado_em = now()
   where f.source = p_fonte and f.ativo
     and not exists (select 1 from _in i where i.external_id = f.external_id);
  get diagnostics v_inativados = row_count;

  insert into food_imports (fonte, versao, ficheiro, actor, total, novos, alterados, inativados, reativados, ignorados)
  values (p_fonte, p_versao, p_ficheiro, p_actor, v_total, v_novos, v_alterados, v_inativados, v_reativados,
          coalesce(p_ignorados, 0));

  return jsonb_build_object('total', v_total, 'novos', v_novos, 'alterados', v_alterados,
                            'inativados', v_inativados, 'reativados', v_reativados);
end $$;

revoke all on function public.import_food_catalog(text, text, text, uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.import_food_catalog(text, text, text, uuid, jsonb, int) to service_role;

-- ---------------------------------------------------------------------------
-- REVERSÃO (não executar com o resto; só se for preciso voltar atrás).
-- Atenção: só apagar os alimentos INSA/TACO se nenhum plano/registo apontar para eles.
--   drop function if exists public.import_food_catalog(text, text, text, uuid, jsonb, int);
--   drop table if exists public.food_imports;
--   drop trigger if exists foods_nome_busca on public.foods;
--   drop function if exists public.foods_nome_busca();
--   drop index if exists public.foods_catalogo_idx;
--   update public.foods set ativo = false where source in ('insa', 'taco');  -- em vez de apagar
-- ---------------------------------------------------------------------------
