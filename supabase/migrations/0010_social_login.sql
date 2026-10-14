-- Contas criadas com Google/Apple: aproveitar o nome que o fornecedor envia.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nome text := nullif(btrim(left(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'), 80)), '');
begin
  insert into public.profiles (id, idioma, nome)
  values (new.id,
          case when new.raw_user_meta_data ->> 'idioma' = 'en' then 'en' else 'pt' end,
          v_nome)
  on conflict do nothing;
  return new;
end $$;
