-- Native widgets keep an offline outbox; retries must not duplicate drinks.
alter table public.water_logs add column if not exists client_event_id uuid;
create unique index if not exists water_logs_client_event_unique
  on public.water_logs (user_id, client_event_id);
-- Existing RLS continues to apply. No service key or new public write policy.
