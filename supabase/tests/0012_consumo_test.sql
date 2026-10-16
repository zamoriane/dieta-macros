-- Teste da migração 0012 (corre numa transação e desfaz tudo no fim).
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/migrations/0012_consumo.sql -f este ficheiro (dentro de begin/rollback)
\set ON_ERROR_STOP 1
do $$
declare
  u uuid := gen_random_uuid();
  d date := date '2030-01-01';
  r record;
  n int;
begin
  insert into auth.users (id, email) values (u, 'teste-consumo@example.com');
  insert into public.days (user_id, dia) values (u, d);

  -- 1) cópia do plano (como a app antiga: sem estado) → planeado; não conta
  insert into public.log_items (user_id, dia, refeicao, food_name, gramas, gramas_plano, kcal, protein, carbs, fat)
  values (u, d, 'Almoço', 'Arroz', 100, 100, 130, 2.7, 28, 0.3);
  select * into r from public.daily_totals where user_id = u and dia = d;
  assert r.kcal = 0, 'abrir o dia não pode somar calorias';
  assert r.kcal_plano = 130 and r.kcal_pendente = 130 and r.n_planeados = 1, 'plano tem de aparecer como pendente';

  -- 2) extra acrescentado à mão → consumido com data de confirmação
  insert into public.log_items (user_id, dia, refeicao, food_name, gramas, kcal, protein, carbs, fat)
  values (u, d, 'Almoço', 'Maçã', 150, 78, 0.4, 21, 0.3);
  select count(*) into n from public.log_items where user_id = u and food_name = 'Maçã' and estado = 'consumido' and confirmado_em is not null;
  assert n = 1, 'extra tem de ficar consumido';

  -- 3) confirmar o item do plano → conta exatamente uma vez
  update public.log_items set estado = 'consumido' where user_id = u and food_name = 'Arroz';
  select * into r from public.daily_totals where user_id = u and dia = d;
  assert r.kcal = 208 and r.n_consumidos = 2 and r.n_plano_comidos = 1, 'confirmar conta uma vez';
  select count(*) into n from public.log_items where user_id = u and food_name = 'Arroz' and confirmado_em is not null and estado_origem = 'utilizador';
  assert n = 1, 'confirmação regista data e origem';

  -- 4) editar a quantidade recalcula
  update public.log_items set gramas = 200, kcal = 260 where user_id = u and food_name = 'Arroz';
  select * into r from public.daily_totals where user_id = u and dia = d;
  assert r.kcal = 338, 'editar recalcula';

  -- 5) desfazer a confirmação → volta a planeado, sem apagar
  update public.log_items set estado = 'planeado' where user_id = u and food_name = 'Arroz';
  select * into r from public.daily_totals where user_id = u and dia = d;
  assert r.kcal = 78 and r.n_planeados = 1, 'desfazer recalcula sem apagar';
  select count(*) into n from public.log_items where user_id = u and food_name = 'Arroz' and confirmado_em is null;
  assert n = 1, 'desfazer limpa a data de confirmação';

  -- 6) não comido não conta e não apaga o planeamento
  update public.log_items set estado = 'nao_comido' where user_id = u and food_name = 'Arroz';
  select * into r from public.daily_totals where user_id = u and dia = d;
  assert r.kcal = 78 and r.n_nao_comidos = 1 and r.kcal_plano = 260, 'não comido';

  -- 7) dia sem itens aparece com zero itens (sem registo), não como zero confirmado
  insert into public.days (user_id, dia) values (u, d + 1);
  select * into r from public.daily_totals where user_id = u and dia = d + 1;
  assert r.n_consumidos = 0 and r.kcal = 0, 'dia vazio';

  -- 8) valor inválido de estado é recusado
  begin
    update public.log_items set estado = 'talvez' where user_id = u and food_name = 'Arroz';
    raise exception 'devia ter recusado';
  exception when check_violation then null;
  end;

  raise notice 'OK: todos os testes da 0012 passaram';
end $$;
