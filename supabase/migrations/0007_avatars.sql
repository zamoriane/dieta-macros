-- Dieta Macros — foto de perfil (avatar).
-- Executar no Supabase: SQL Editor > New query > colar tudo > Run.

alter table public.profiles add column if not exists avatar_url text;

-- Bucket público só de leitura; o app reduz a imagem para 256×256 WebP (~20–40 KB) antes de enviar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Cada utilizador só escreve na sua pasta: avatars/<id do utilizador>/...
drop policy if exists "avatar: enviar o próprio" on storage.objects;
create policy "avatar: enviar o próprio" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar: alterar o próprio" on storage.objects;
create policy "avatar: alterar o próprio" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar: apagar o próprio" on storage.objects;
create policy "avatar: apagar o próprio" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar: listar o próprio" on storage.objects;
create policy "avatar: listar o próprio" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- O avatar só pode apontar para a pasta do próprio utilizador neste projeto
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or avatar_url ~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/' || id::text || '/[A-Za-z0-9._-]+$'));

-- Treinador e cliente veem o avatar um do outro na lista de ligações
drop function if exists public.my_links();
create function public.my_links()
returns table (
  id bigint, papel text, outra_id uuid, outra_nome text, outra_email text, status text,
  perm_dieta boolean, perm_treino boolean, perm_progresso boolean, criado_em timestamptz, aceite_em timestamptz,
  outra_avatar text
)
language sql stable security definer set search_path = public as $$
  select l.id,
         case when l.client_id = auth.uid() then 'cliente' else 'treinador' end,
         case when l.client_id = auth.uid() then l.trainer_id else l.client_id end,
         p.nome,
         case when l.client_id = auth.uid() then coalesce(p.pt_contacto_email, u.email) else u.email end,
         l.status, l.perm_dieta, l.perm_treino, l.perm_progresso, l.criado_em, l.aceite_em,
         p.avatar_url
  from public.trainer_links l
  join public.profiles p on p.id = case when l.client_id = auth.uid() then l.trainer_id else l.client_id end
  join auth.users u on u.id = p.id
  where (l.client_id = auth.uid() or l.trainer_id = auth.uid())
    and l.status in ('pendente', 'ativo')
  order by l.status, l.criado_em desc;
$$;
