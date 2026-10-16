-- Taking care of yourself — separa o PLANEADO do CONSUMIDO no diário alimentar.
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.
--
-- Antes: o plano era copiado para log_items e contava logo como "ingerido".
-- Agora cada item tem um estado:
--   planeado    → veio do plano e ainda não foi confirmado (não conta como ingerido)
--   consumido   → confirmado pelo utilizador (conta)
--   nao_comido  → o utilizador indicou que não comeu (não conta; o planeamento fica)
--   legado      → item antigo do plano, nunca editado: não se sabe se foi comido (não conta)
-- e uma origem do estado: utilizador | inferido (regra da migração) | migracao (sem informação).
--
-- Não apaga nem altera valores nutricionais. Reversão no fim do ficheiro.

alter table public.log_items
  add column if not exists estado text not null default 'consumido',
  add column if not exists estado_origem text not null default 'utilizador',
  add column if not exists confirmado_em timestamptz,
  add column if not exists alterado_em timestamptz;

alter table public.log_items drop constraint if exists log_items_estado_check;
alter table public.log_items add constraint log_items_estado_check
  check (estado in ('planeado', 'consumido', 'nao_comido', 'legado'));
alter table public.log_items drop constraint if exists log_items_estado_origem_check;
alter table public.log_items add constraint log_items_estado_origem_check
  check (estado_origem in ('utilizador', 'inferido', 'migracao'));

-- Durante a migração o gatilho não deve correr (é recriado mais abaixo)
drop trigger if exists log_items_estado on public.log_items;

-- Dia marcado como completo pelo utilizador (registo do dia terminado)
alter table public.days add column if not exists completo boolean not null default false;

-- ---------------------------------------------------------------------------
-- Classificação dos registos antigos (só linhas ainda não tocadas pela app nova:
-- consumido + utilizador + sem confirmação). Pode correr mais de uma vez sem efeito extra.
--   extras (sem gramas_plano)               → consumido, inferido
--   do plano com quantidade alterada        → consumido, inferido
--   do plano exatamente como planeado       → legado, migracao
-- ---------------------------------------------------------------------------
update public.log_items
   set estado_origem = 'inferido'
 where estado = 'consumido' and estado_origem = 'utilizador' and confirmado_em is null
   and (gramas_plano is null or gramas <> gramas_plano);

update public.log_items
   set estado = 'legado', estado_origem = 'migracao'
 where estado = 'consumido' and estado_origem = 'utilizador' and confirmado_em is null
   and gramas_plano is not null and gramas = gramas_plano;

-- ---------------------------------------------------------------------------
-- Datas de confirmação e de alteração mantidas pela base de dados
-- ---------------------------------------------------------------------------
create or replace function public.log_items_estado() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Cópia do plano sem confirmação explícita (inclui a app antiga, que não conhece o estado) → planeado
    if new.estado = 'consumido' and new.confirmado_em is null and new.gramas_plano is not null then
      new.estado := 'planeado';
    elsif new.estado = 'consumido' and new.confirmado_em is null then
      new.confirmado_em := now();  -- alimento acrescentado à mão = consumido
    end if;
    return new;
  end if;
  new.alterado_em := now();
  if new.estado is distinct from old.estado then
    new.estado_origem := 'utilizador';
    new.confirmado_em := case when new.estado = 'consumido' then now() else null end;
  end if;
  return new;
end $$;

drop trigger if exists log_items_estado on public.log_items;
create trigger log_items_estado before insert or update on public.log_items
  for each row execute function public.log_items_estado();

-- ---------------------------------------------------------------------------
-- Totais por dia: kcal/protein/carbs/fat/fiber passam a ser SÓ o consumido.
-- Colunas novas dizem o que estava planeado e o que falta confirmar.
-- ---------------------------------------------------------------------------
drop view if exists public.daily_totals;
create view public.daily_totals with (security_invoker = true) as
select d.user_id, d.dia, d.completo,
       round(coalesce(sum(l.kcal)    filter (where l.estado = 'consumido'), 0), 0) as kcal,
       round(coalesce(sum(l.protein) filter (where l.estado = 'consumido'), 0), 1) as protein,
       round(coalesce(sum(l.carbs)   filter (where l.estado = 'consumido'), 0), 1) as carbs,
       round(coalesce(sum(l.fat)     filter (where l.estado = 'consumido'), 0), 1) as fat,
       round(coalesce(sum(l.fiber)   filter (where l.estado = 'consumido'), 0), 1) as fiber,
       round(coalesce(sum(l.kcal)    filter (where l.gramas_plano is not null), 0), 0) as kcal_plano,
       round(coalesce(sum(l.kcal)    filter (where l.estado in ('planeado', 'legado')), 0), 0) as kcal_pendente,
       count(l.id) filter (where l.estado = 'consumido')                                as n_consumidos,
       count(l.id) filter (where l.estado = 'planeado')                                 as n_planeados,
       count(l.id) filter (where l.estado = 'legado')                                   as n_legado,
       count(l.id) filter (where l.estado = 'nao_comido')                               as n_nao_comidos,
       count(l.id) filter (where l.gramas_plano is not null)                            as n_plano,
       count(l.id) filter (where l.gramas_plano is not null and l.estado = 'consumido') as n_plano_comidos
from public.days d
left join public.log_items l on l.user_id = d.user_id and l.dia = d.dia
group by d.user_id, d.dia, d.completo;

-- ---------------------------------------------------------------------------
-- REVERSÃO (não executar com o resto; só se for preciso voltar atrás):
--   drop trigger if exists log_items_estado on public.log_items;
--   drop function if exists public.log_items_estado();
--   drop view if exists public.daily_totals;
--   create view public.daily_totals with (security_invoker = true) as
--     select user_id, dia, round(sum(kcal), 0) as kcal, round(sum(protein), 1) as protein,
--            round(sum(carbs), 1) as carbs, round(sum(fat), 1) as fat, round(sum(fiber), 1) as fiber
--       from public.log_items group by user_id, dia;
--   alter table public.log_items drop column estado, drop column estado_origem,
--     drop column confirmado_em, drop column alterado_em;
--   alter table public.days drop column completo;
-- ---------------------------------------------------------------------------
