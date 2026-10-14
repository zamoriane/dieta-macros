-- Taking care of yourself — idioma da interface por utilizador (pt = português de Portugal, en = inglês).
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.

alter table public.profiles add column if not exists idioma text not null default 'pt';
alter table public.profiles drop constraint if exists profiles_idioma_check;
alter table public.profiles add constraint profiles_idioma_check check (idioma in ('pt', 'en'));

-- Contas novas: usar o idioma escolhido no ecrã de registo (guardado nos metadados do utilizador)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, idioma)
  values (new.id, case when new.raw_user_meta_data ->> 'idioma' = 'en' then 'en' else 'pt' end)
  on conflict do nothing;
  return new;
end $$;
