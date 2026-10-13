-- Dieta Macros — correção: apagar uma conta falhava porque o histórico do plano tentava registar
-- as remoções em cascata para um utilizador que já não existe.
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.

create or replace function public.plan_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := coalesce(new.user_id, old.user_id);
  v_acao text := case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'removeu' end;
  v_resumo text;
  v_food text;
  v_meal text;
begin
  -- Conta a ser apagada (cascata): não há dono a quem associar o histórico.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = v_owner) then
    return null;
  end if;
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

create or replace function public.workout_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := coalesce(new.user_id, old.user_id);
  v_acao text := case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'removeu' end;
  v_resumo text;
  v_day text;
  v_ex text;
begin
  -- Conta a ser apagada (cascata): não há dono a quem associar o histórico.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = v_owner) then
    return null;
  end if;
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

