do $$ begin
  if has_table_privilege('anon', 'public.victus_live_devices', 'SELECT') or
     has_table_privilege('authenticated', 'public.victus_live_devices', 'SELECT') or
     has_function_privilege('authenticated', 'public.claim_victus_live(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'Private data exposed';
  end if;
end $$;
set role service_role;
do $$
declare
  u uuid := '00000000-0000-0000-0000-000000000001';
  i uuid := '00000000-0000-0000-0000-000000000002';
begin
  insert into public.victus_live_devices(user_id,installation_id,enabled) values(u,i,true);
  if not public.claim_victus_live(u,i,'2026-10-17') then raise exception 'First claim rejected'; end if;
  if public.claim_victus_live(u,i,'2026-10-17') then raise exception 'Duplicate claim'; end if;
  update public.victus_live_devices set enabled=false;
  if public.claim_victus_live(u,i,'2026-10-18') then raise exception 'Revoked claim'; end if;
  update public.victus_live_devices set enabled=true,last_local_day='2026-10-18';
  if public.claim_victus_live(u,i,'2026-10-18') then raise exception 'Local start duplicated'; end if;
  update public.victus_live_devices set last_local_day=null,updated_at=now()-interval '4 days';
  if public.claim_victus_live(u,i,'2026-10-18') then raise exception 'Expired registration'; end if;
end $$;
reset role;
delete from auth.users;
do $$ begin
  if exists(select 1 from public.victus_live_devices) or exists(select 1 from public.victus_live_dispatches) then
    raise exception 'Account deletion did not cascade';
  end if;
end $$;
