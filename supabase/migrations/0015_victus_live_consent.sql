-- Push tokens are private server data, never exposed through the browser client.
create table if not exists public.victus_live_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  token text,
  enabled boolean not null default false,
  locale text not null default 'pt' check (locale in ('pt', 'en')),
  timezone text not null default 'Europe/Lisbon',
  goal_ml integer not null default 2000 check (goal_ml between 500 and 8000),
  slots jsonb not null default '[]',
  last_local_day text,
  updated_at timestamptz not null default now(),
  primary key (user_id, installation_id)
);
alter table public.victus_live_devices enable row level security;
revoke all on public.victus_live_devices from anon, authenticated;
grant all on public.victus_live_devices to service_role;
create table if not exists public.victus_live_dispatches (
  user_id uuid not null,
  installation_id uuid not null,
  day text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, installation_id, day),
  foreign key (user_id, installation_id) references public.victus_live_devices(user_id, installation_id) on delete cascade
);
alter table public.victus_live_dispatches enable row level security;
revoke all on public.victus_live_dispatches from anon, authenticated;
grant all on public.victus_live_dispatches to service_role;
create or replace function public.claim_victus_live(p_user uuid, p_installation uuid, p_day text)
returns boolean language plpgsql set search_path = public as $$
begin
  perform 1 from public.victus_live_devices where user_id = p_user and installation_id = p_installation
    and enabled and updated_at > now() - interval '3 days'
    and last_local_day is distinct from p_day for update;
  if not found then return false; end if;
  insert into public.victus_live_dispatches(user_id, installation_id, day)
    values (p_user, p_installation, p_day) on conflict do nothing;
  return found;
end;
$$;
revoke all on function public.claim_victus_live(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_victus_live(uuid,uuid,text) to service_role;
