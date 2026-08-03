-- Applied to CC Analytics production Supabase.
-- Sundays are non-working by default; explicit overrides define holidays,
-- operational exceptions and enabled Sundays by department and zone.

create table if not exists public.analytics_business_calendar (
  id uuid primary key default gen_random_uuid(),
  calendar_date date not null,
  department text not null default 'Todos',
  zone text not null default 'Todas',
  is_working_day boolean not null,
  event_type text not null default 'ajuste',
  label text not null,
  reason text not null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(calendar_date, department, zone)
);

-- Runtime functions installed in production:
-- analytics_month_calendar(date,text,text)
-- analytics_working_day_stats(date,text,text,date)
-- analytics_set_business_day(date,text,text,boolean,text,text,text)
