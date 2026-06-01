-- Supabase setup for the hosted Jarvis access gate.
-- Run this in Supabase SQL Editor for the project used by VITE_SUPABASE_URL.
-- Then create an Auth user for support@flowlog.dev and set its password in
-- Supabase Authentication. Do not hardcode the admin password in frontend code.

create table if not exists public.jarvis_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null unique,
  full_name text,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

alter table public.jarvis_access_requests enable row level security;

drop policy if exists "users read own access request" on public.jarvis_access_requests;
create policy "users read own access request"
on public.jarvis_access_requests
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'support@flowlog.dev'
);

drop policy if exists "users create own access request" on public.jarvis_access_requests;
create policy "users create own access request"
on public.jarvis_access_requests
for insert
to authenticated
with check (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'support@flowlog.dev'
);

drop policy if exists "admin updates access requests" on public.jarvis_access_requests;
create policy "admin updates access requests"
on public.jarvis_access_requests
for update
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'support@flowlog.dev')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'support@flowlog.dev');
