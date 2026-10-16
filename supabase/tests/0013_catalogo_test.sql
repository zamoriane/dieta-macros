-- Teste da migração 0013 (corre numa transação e desfaz tudo no fim).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/0013_catalogo_test.sql
begin;

do $$
declare r jsonb; v_id bigint; n int;
begin
  -- 1.ª importação: 3 alimentos
  r := public.import_food_catalog('insa', '7.1 (2026)', 'insa.xlsx', null, '[
    {"external_id": 624, "name": "Abacate, Hass", "grupo": "Frutos", "kcal_100g": 176, "protein_100g": 1.1, "carbs_100g": 2.3, "fat_100g": 17.4, "fiber_100g": 3, "sugar_100g": 2.3, "extra": {"sal_g": 0}},
    {"external_id": 579, "name": "Abóbora crua", "grupo": "Hortícolas", "kcal_100g": 11, "protein_100g": 0.3, "carbs_100g": 1.7, "fat_100g": 0.2, "fiber_100g": 0.7},
    {"external_id": 726, "name": "Cerveja branca", "grupo": "Bebidas alcoólicas", "unidade": "ml", "kcal_100g": 43}
  ]'::jsonb, 2);
  assert (r ->> 'novos')::int = 3 and (r ->> 'alterados')::int = 0, 'novos: ' || r;
  assert (select count(*) from public.foods where source = 'insa' and ativo) = 3, 'ativos';
  assert (select nome_busca from public.foods where source = 'insa' and external_id = 579) = 'abobora crua', 'sem acentos';
  assert (select unidade from public.foods where source = 'insa' and external_id = 726) = 'ml', 'unidade ml';
  assert (select ignorados from public.food_imports order by id desc limit 1) = 2, 'ignorados no histórico';

  select id into v_id from public.foods where source = 'insa' and external_id = 624;

  -- 2.ª importação: abacate alterado, abóbora igual, cerveja saiu, novo alimento
  r := public.import_food_catalog('insa', '7.2 (2027)', 'insa2.xlsx', null, '[
    {"external_id": 624, "name": "Abacate, Hass", "grupo": "Frutos", "kcal_100g": 180, "protein_100g": 1.1, "carbs_100g": 2.3, "fat_100g": 17.4, "fiber_100g": 3, "sugar_100g": 2.3},
    {"external_id": 579, "name": "Abóbora crua", "grupo": "Hortícolas", "kcal_100g": 11, "protein_100g": 0.3, "carbs_100g": 1.7, "fat_100g": 0.2, "fiber_100g": 0.7},
    {"external_id": 1188, "name": "Açafrão", "grupo": "Especiarias", "kcal_100g": 353}
  ]'::jsonb);
  assert (r ->> 'novos')::int = 1 and (r ->> 'alterados')::int = 1 and (r ->> 'inativados')::int = 1, '2.ª: ' || r;
  -- o id mantém-se (planos e registos continuam a apontar para o mesmo alimento)
  assert (select id from public.foods where source = 'insa' and external_id = 624) = v_id, 'id estável';
  assert (select kcal_100g from public.foods where id = v_id) = 180, 'valor atualizado';
  -- nada apagado: a cerveja continua lá, inativa
  assert (select ativo from public.foods where source = 'insa' and external_id = 726) = false, 'inativo';
  assert (select count(*) from public.foods where source = 'insa') = 4, 'nada apagado';

  -- 3.ª importação: a cerveja volta → reativada
  r := public.import_food_catalog('insa', '7.3', null, null, '[
    {"external_id": 726, "name": "Cerveja branca", "grupo": "Bebidas alcoólicas", "unidade": "ml", "kcal_100g": 43}
  ]'::jsonb);
  assert (r ->> 'reativados')::int = 1 and (r ->> 'inativados')::int = 3, '3.ª: ' || r;

  -- outra fonte não mexe na INSA
  r := public.import_food_catalog('taco', '4.ª edição', null, null, '[{"external_id": 1, "name": "Arroz, integral, cozido", "kcal_100g": 123.53}]'::jsonb);
  assert (select count(*) from public.foods where source = 'insa' and ativo) = 1, 'fontes independentes';
  assert (select kcal_100g from public.foods where source = 'taco' and external_id = 1) = 123.53, 'arredonda a 2 casas';

  -- erros: tudo ou nada
  begin
    perform public.import_food_catalog('taco', 'x', null, null, '[{"external_id": 1, "name": "A", "kcal_100g": 1}, {"external_id": 1, "name": "B", "kcal_100g": 2}]'::jsonb);
    assert false, 'devia falhar com códigos repetidos';
  exception when raise_exception then null; end;
  assert (select name from public.foods where source = 'taco' and external_id = 1) = 'Arroz, integral, cozido', 'tudo ou nada';
  begin
    perform public.import_food_catalog('outra', 'x', null, null, '[{"external_id": 1, "name": "A", "kcal_100g": 1}]'::jsonb);
    assert false, 'devia falhar com fonte inválida';
  exception when raise_exception then null; end;

  -- alimentos já existentes ganham o campo de pesquisa
  select count(*) into n from public.foods where nome_busca is null;
  assert n = 0, 'nome_busca preenchido';
  raise notice 'OK 0013';
end $$;

-- permissões: só service_role executa a função
select has_function_privilege('authenticated', 'public.import_food_catalog(text, text, text, uuid, jsonb, int)', 'execute') as authenticated_pode,
       has_function_privilege('anon', 'public.import_food_catalog(text, text, text, uuid, jsonb, int)', 'execute') as anon_pode,
       has_function_privilege('service_role', 'public.import_food_catalog(text, text, text, uuid, jsonb, int)', 'execute') as service_pode;

rollback;
