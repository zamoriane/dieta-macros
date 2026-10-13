-- Dieta Macros — dados de demonstração: a conta do dono (zamoriane@gmail.com) fica como Treinador (PT)
-- e é criado um "Aluno Exemplo" fictício (sem login possível) ligado a ela, com 30 dias de dados.
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run. Pode correr várias vezes (recria o aluno).
-- Para remover o aluno no fim: ver o bloco "REMOVER" no fim do ficheiro.

do $$
declare
  v_pt     uuid;
  v_aluno  uuid := 'de000000-0000-4000-8000-000000000001';
  v_email  text := 'aluno.exemplo@exemplo.invalid';
  f        record;
  m_pa bigint; m_al bigint; m_la bigint; m_ja bigint;
  w_a bigint; w_b bigint;
  d date;
  k int;
  x record;
  s int;
begin
  select id into v_pt from auth.users where email = 'zamoriane@gmail.com';
  if v_pt is null then raise exception 'Conta zamoriane@gmail.com não encontrada'; end if;

  -- 1. A sua conta passa a Treinador aprovado (mantém o papel de admin)
  update public.profiles
     set pt_estado = 'aprovado',
         pt_pedido_em = coalesce(pt_pedido_em, now()),
         pt_contacto_email = coalesce(pt_contacto_email, 'zamoriane@gmail.com'),
         trainer_code = coalesce(trainer_code, 'PT-' || upper(substr(md5(random()::text), 1, 5)))
   where id = v_pt;

  -- 2. Aluno fictício (recriado do zero; apagar o utilizador apaga todos os dados dele em cascata)
  delete from auth.users where id = v_aluno;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_aluno, 'authenticated', 'authenticated', v_email, '', now(),
          '{"provider":"email","providers":["email"]}', '{"demo":true}', now() - interval '30 days', now(),
          '', '', '', '', '', '', '');

  update public.profiles
     set nome = 'Aluno Exemplo', sexo = 'M', data_nascimento = '1990-05-10', altura_cm = 178,
         peso_meta_kg = 78, deficit_alvo_kcal = 500, proteina_g_kg = 2.0, fonte_atividade = 'oura'
   where id = v_aluno;

  -- 3. Ligação ativa treinador ↔ aluno com todas as permissões
  insert into public.trainer_links (trainer_id, client_id, status, perm_dieta, perm_treino, perm_progresso, criado_em, aceite_em)
  values (v_pt, v_aluno, 'ativo', true, true, true, now() - interval '30 days', now() - interval '30 days');

  perform setseed(0.42);

  -- 4. Peso (30 dias, de ~86 kg a ~84 kg) e atividade "Oura"
  for k in 0..29 loop
    d := current_date - 29 + k;
    insert into public.weights (user_id, dia, kg) values (v_aluno, d, round((86.2 - k * 0.07 + (random() - 0.5) * 0.6)::numeric, 1));
    insert into public.oura_daily (user_id, dia, active_calories, total_calories, steps, sleep_score, readiness_score)
    values (v_aluno, d, 380 + (random() * 380)::int, 2300 + (random() * 500)::int, 6000 + (random() * 7000)::int,
            68 + (random() * 22)::int, 65 + (random() * 25)::int);
  end loop;

  -- 5. Alimentos (próprios do aluno; o treinador vê-os pela ligação)
  create temp table if not exists demo_foods (nome text primary key, id bigint) on commit drop;
  truncate demo_foods;
  for f in select * from (values
      ('Aveia em flocos', 389, 16.9, 66.3, 6.9, 10.6), ('Leite meio-gordo', 47, 3.3, 4.8, 1.6, 0),
      ('Banana', 89, 1.1, 22.8, 0.3, 2.6), ('Peito de frango grelhado', 165, 31, 0, 3.6, 0),
      ('Arroz branco cozido', 130, 2.7, 28, 0.3, 0.4), ('Brócolos cozidos', 35, 2.4, 7.2, 0.4, 3.3),
      ('Iogurte grego natural', 97, 9, 3.9, 5, 0), ('Amêndoas', 579, 21, 22, 50, 12.5),
      ('Salmão grelhado', 206, 22, 0, 12, 0), ('Batata-doce cozida', 86, 1.6, 20, 0.1, 3),
      ('Azeite', 884, 0, 0, 100, 0)) t(nome, kcal, p, c, g, fib)
  loop
    with ins as (
      insert into public.foods (user_id, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g)
      values (v_aluno, 'custom', f.nome, f.kcal, f.p, f.c, f.g, f.fib) returning id)
    insert into demo_foods select f.nome, id from ins;
  end loop;

  -- 6. Plano alimentar base (criado pelo "sistema"; depois o treinador faz um ajuste)
  insert into public.plan_meals (user_id, nome, posicao) values (v_aluno, 'Pequeno-almoço', 0) returning id into m_pa;
  insert into public.plan_meals (user_id, nome, posicao) values (v_aluno, 'Almoço', 1) returning id into m_al;
  insert into public.plan_meals (user_id, nome, posicao) values (v_aluno, 'Lanche', 2) returning id into m_la;
  insert into public.plan_meals (user_id, nome, posicao) values (v_aluno, 'Jantar', 3) returning id into m_ja;
  insert into public.plan_items (user_id, plan_meal_id, food_id, gramas, posicao)
  select v_aluno, meal, (select id from demo_foods where nome = food), g, pos from (values
    (m_pa, 'Aveia em flocos', 60, 0), (m_pa, 'Leite meio-gordo', 250, 1), (m_pa, 'Banana', 120, 2),
    (m_al, 'Peito de frango grelhado', 180, 0), (m_al, 'Arroz branco cozido', 200, 1), (m_al, 'Brócolos cozidos', 150, 2), (m_al, 'Azeite', 10, 3),
    (m_la, 'Iogurte grego natural', 170, 0), (m_la, 'Amêndoas', 25, 1),
    (m_ja, 'Salmão grelhado', 150, 0), (m_ja, 'Batata-doce cozida', 250, 1), (m_ja, 'Brócolos cozidos', 150, 2), (m_ja, 'Azeite', 10, 3)
  ) t(meal, food, g, pos);

  -- 7. Registos dos últimos 14 dias (plano com variações; às vezes salta o lanche) e hoje só o pequeno-almoço
  for k in 0..13 loop
    d := current_date - 13 + k;
    insert into public.days (user_id, dia) values (v_aluno, d);
    insert into public.log_items (user_id, dia, refeicao, refeicao_pos, food_id, food_name, gramas, gramas_plano, kcal, protein, carbs, fat, fiber)
    select v_aluno, d, pm.nome, pm.posicao, fo.id, fo.name, q.g, pi.gramas,
           round(fo.kcal_100g * q.g / 100, 1), round(fo.protein_100g * q.g / 100, 1), round(fo.carbs_100g * q.g / 100, 1),
           round(fo.fat_100g * q.g / 100, 1), round(fo.fiber_100g * q.g / 100, 1)
      from public.plan_items pi
      join public.plan_meals pm on pm.id = pi.plan_meal_id
      join public.foods fo on fo.id = pi.food_id
      cross join lateral (select round((pi.gramas * (0.85 + random() * 0.3))::numeric, 0) as g) q
     where pi.user_id = v_aluno
       and (d < current_date or pm.posicao = 0)
       and not (pm.nome = 'Lanche' and random() < 0.3);
  end loop;

  -- 8. Plano de treino: A (seg/qui) peito e tríceps, B (ter/sex) costas e pernas
  insert into public.workout_days (user_id, nome, dias_semana, notas, posicao)
  values (v_aluno, 'Treino A — Peito e tríceps', '{1,4}', 'Aquecimento: 5 min de remo + 2 séries leves no supino.', 0) returning id into w_a;
  insert into public.workout_days (user_id, nome, dias_semana, notas, posicao)
  values (v_aluno, 'Treino B — Costas e pernas', '{2,5}', null, 1) returning id into w_b;

  insert into public.workout_exercises (user_id, workout_day_id, exercise_id, nome, imagem, series, reps, carga_kg, descanso_s, notas, posicao)
  select v_aluno, t.dia, e.id, coalesce(e.nome, t.fallback), e.imagem_thumb, t.series, t.reps, t.carga, t.descanso, t.notas, t.pos
    from (values
      (w_a, 0, 'Bench Press', 'Supino reto com barra', 4, '8-10', 60.0, 120, 'Descer a barra controlada até ao peito.'),
      (w_a, 1, 'Incline Bench Press - Dumbbell', 'Supino inclinado com halteres', 3, '10-12', 22.0, 90, null),
      (w_a, 2, 'Fly With Dumbbells', 'Crucifixo com halteres', 3, '12-15', 12.0, 60, null),
      (w_a, 3, 'Triceps Pushdown', 'Tríceps na polia', 3, '12', 25.0, 60, null),
      (w_b, 0, 'Squats', 'Agachamento com barra', 4, '6-8', 80.0, 150, 'Profundidade até à paralela.'),
      (w_b, 1, 'Lat Pull Down (Straight Back)', 'Puxada à frente', 4, '10', 55.0, 90, null),
      (w_b, 2, 'Bent Over Rowing', 'Remada curvada com barra', 3, '10', 50.0, 90, null),
      (w_b, 3, 'Romanian Deadlift', 'Stiff', 3, '10', 60.0, 120, null)
    ) t(dia, pos, en, fallback, series, reps, carga, descanso, notas)
    left join lateral (
      select id, nome, imagem_thumb from public.exercises
       where nome_en ilike t.en or nome_en ilike t.en || '%'
       order by (nome_en ilike t.en) desc, rank, length(nome_en) limit 1
    ) e on true;

  -- 9. Séries feitas nas últimas 2 semanas (com pequena progressão de carga)
  perform set_config('request.jwt.claim.sub', v_aluno::text, false);
  for d in select g::date from generate_series(current_date - 14, current_date - 1, interval '1 day') g loop
    for x in select we.* from public.workout_exercises we join public.workout_days wd on wd.id = we.workout_day_id
              where we.user_id = v_aluno and extract(dow from d)::int = any (wd.dias_semana) loop
      for s in 1..x.series loop
        insert into public.workout_logs (user_id, dia, workout_day_id, workout_exercise_id, exercise_id, nome, serie, reps, carga_kg, feito_em)
        values (v_aluno, d, x.workout_day_id, x.id, x.exercise_id, x.nome, s,
                greatest(4, coalesce(substring(x.reps from '\d+')::int, 10) + 1 - s + (random() * 2)::int),
                x.carga_kg - case when d < current_date - 7 then 2.5 else 0 end,
                d + time '18:30' + (s * interval '3 minutes'));
      end loop;
    end loop;
  end loop;

  -- 10. Ajustes feitos "pelo treinador", para aparecerem no histórico com o seu nome
  perform set_config('request.jwt.claim.sub', v_pt::text, false);
  update public.plan_items set gramas = 160 where plan_meal_id = m_al and food_id = (select id from demo_foods where nome = 'Arroz branco cozido');
  update public.workout_exercises set carga_kg = 62.5 where workout_day_id = w_a and posicao = 0;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- Confirmação
select p.nome, p.pt_estado, p.trainer_code,
       (select count(*) from public.trainer_links l where l.trainer_id = p.id and l.status = 'ativo') as clientes_ativos
  from public.profiles p join auth.users u on u.id = p.id
 where u.email = 'zamoriane@gmail.com';

-- REMOVER o aluno de exemplo (apaga todos os dados dele):
-- delete from auth.users where id = 'de000000-0000-4000-8000-000000000001';
