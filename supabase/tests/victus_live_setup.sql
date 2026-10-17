-- Disposable CI database only; never run this fixture in Supabase production.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
